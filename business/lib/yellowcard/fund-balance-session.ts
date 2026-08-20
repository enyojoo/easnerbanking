import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  YC_QUOTE_TTL_MS,
  buildYcFundBalanceDepositReviewSnapshot,
  buildYcFundBalanceDisplayFees,
  computeDisplayProcessingFee,
  computeYcFundBalancePricing,
  computeYcFundBalancePricingBeforeReceive,
  buildYcReceiveLegFromResponse,
  resolveYcFundBalanceDepositTitle,
  resolveYcLockedLocalPayInFromReceive,
  resolveYcPayInLimits,
  validateYcPayInLocalAmount,
} from "@easner/shared"
import { findYcPayInLeg, listYcRates } from "@/lib/fx/yc-rates"
import { submitYcReceive } from "@/lib/yellowcard/receive-submit"
import { buildYcKycPersonMetadata } from "@/lib/yellowcard/kyc-metadata"
import { listYellowcardChannels, readYcResponseChannelId } from "@/lib/yellowcard/channels"
import { buildYcFundBalanceReceiveMetadata } from "@/lib/yellowcard/yc-ledger"
import { isYcLocalPayInEnabledForCorridor } from "@/lib/yellowcard/yc-receive-gate"
import { depositOmnibusSolanaAddressUsd } from "@/lib/deposit-omnibus/config"
import { generateTransactionId } from "@/lib/transaction-id"
import { findYcReceiveChannel } from "@/lib/yellowcard/receive-rails"
import { quoteFiatProcessingFeeBps } from "@/lib/processing-fee/quote-processing-fee-bps"
import { mapKycErrorToCode } from "@/lib/yellowcard/fund-balance-quote-errors"
import { parseYcReceiveRejectedMinError } from "@easner/shared"

export type FundBalanceRail = "bank_transfer" | "mobile_money"

export type FundBalanceSessionContext = {
  admin: SupabaseClient
  kycUserId: string
  businessId: string | null
  currency: string
  country: string
  rail: FundBalanceRail
  usdCredit?: number
  localPayIn?: number
  userRow: {
    residence_country?: string | null
    kyc_id_type?: string | null
    kyc_id_number?: string | null
    ng_local_id_type?: string | null
    ng_local_id_number?: string | null
    full_name?: string | null
    phone?: string | null
    email?: string | null
    date_of_birth?: string | null
    kyc_address_street?: string | null
    kyc_address_city?: string | null
    kyc_address_country?: string | null
  } | null
}

export class FundBalanceSessionError extends Error {
  code: string
  status: number
  extra?: Record<string, unknown>

  constructor(code: string, message: string, status: number, extra?: Record<string, unknown>) {
    super(message)
    this.code = code
    this.status = status
    this.extra = extra
  }
}

async function prepareFundBalanceSession(ctx: FundBalanceSessionContext) {
  const { admin, kycUserId, currency, country, rail, userRow } = ctx

  const rates = await listYcRates(admin, { status: "active" })
  const leg = findYcPayInLeg(rates, currency)
  if (!leg?.easner_sell || !leg.yc_buy) {
    throw new FundBalanceSessionError(
      "yc_rate_unavailable",
      "YC rate unavailable for currency",
      400,
      { userId: kycUserId, currency, country },
    )
  }

  const payInEnabled = await isYcLocalPayInEnabledForCorridor(admin, {
    countryCode: country,
    currencyCode: currency,
    rail,
  })
  if (!payInEnabled) {
    throw new FundBalanceSessionError(
      "yc_corridor_disabled",
      "Local pay-in is not enabled for this corridor",
      403,
      { userId: kycUserId, currency, country, rail },
    )
  }

  if (!depositOmnibusSolanaAddressUsd()) {
    throw new FundBalanceSessionError(
      "yc_settlement_wallet_not_configured",
      "deposit_omnibus_solana_address_usd_required",
      503,
      {
        hint: "Set DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD on the business API (USDC Solana omnibus for YC pay-in settlement).",
      },
    )
  }

  const channels = await listYellowcardChannels()
  const channel = findYcReceiveChannel(channels, { country, currency, rail })
  const channelId = String(channel?.id ?? channel?.channelId ?? "").trim()
  if (!channelId) {
    throw new FundBalanceSessionError(
      "yc_channel_missing",
      "No YC receive channel",
      400,
      { userId: kycUserId, currency, country, rail },
    )
  }

  const payInLimits = resolveYcPayInLimits({
    country,
    currency,
    rail,
    channel: channel as Record<string, unknown>,
  })

  let sender
  try {
    sender = buildYcKycPersonMetadata({
      profile: {
        residenceCountry: userRow?.residence_country ?? country,
        kycIdType: userRow?.kyc_id_type,
        kycIdNumber: userRow?.kyc_id_number,
        ngLocalIdType: userRow?.ng_local_id_type,
        ngLocalIdNumber: userRow?.ng_local_id_number,
        fullName: userRow?.full_name,
        phone: userRow?.phone,
        email: userRow?.email,
        dateOfBirth: userRow?.date_of_birth,
        addressStreet: userRow?.kyc_address_street,
        addressCity: userRow?.kyc_address_city,
        addressCountry: userRow?.kyc_address_country,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "KYC metadata failed"
    throw new FundBalanceSessionError(
      mapKycErrorToCode(message),
      message,
      400,
      { userId: kycUserId, currency, country, rail },
    )
  }

  const provisional = computeYcFundBalancePricingBeforeReceive({
    usdCredit: ctx.usdCredit,
    localPayIn: ctx.localPayIn,
    customerSellRate: Number(leg.easner_sell),
    ycSellRate: Number(leg.yc_buy),
    rail: ctx.rail,
    processingFeeBps: await quoteFiatProcessingFeeBps(
      admin,
      { countryCode: country, currencyCode: currency, rail: ctx.rail },
      "pay_in",
      { userId: kycUserId, businessId: ctx.businessId },
    ),
  })

  const amountCheck = validateYcPayInLocalAmount({
    localPayIn: provisional.localPayIn,
    currency,
    limits: {
      minLocalPayIn: payInLimits.minLocalPayIn,
      maxLocalPayIn: payInLimits.maxLocalPayIn,
    },
  })
  if (!amountCheck.ok) {
    const belowMin =
      payInLimits.minLocalPayIn != null && provisional.localPayIn < payInLimits.minLocalPayIn
    const aboveMax =
      payInLimits.maxLocalPayIn != null && provisional.localPayIn > payInLimits.maxLocalPayIn
    throw new FundBalanceSessionError(
      belowMin ? "yc_amount_below_min" : aboveMax ? "yc_amount_above_max" : "yc_receive_rejected",
      amountCheck.message,
      400,
      {
        userId: kycUserId,
        currency,
        country,
        rail,
        minLocalPayIn: payInLimits.minLocalPayIn,
        maxLocalPayIn: payInLimits.maxLocalPayIn,
      },
    )
  }

  return {
    leg,
    channelId,
    sender,
    provisional,
    customerRate: Number(leg.easner_sell),
  }
}

function buildFundBalanceMetadata(input: {
  sequenceId: string
  pricing: ReturnType<typeof computeYcFundBalancePricing>
  currency: string
  country: string
  rail: FundBalanceRail
  customerRate: number
  residenceCountry: string
}) {
  const depositReview = buildYcFundBalanceDepositReviewSnapshot({
    localPayIn: input.pricing.localPayIn,
    localCurrency: input.currency,
    usdCredit: input.pricing.usdCredit,
    processingFee: input.pricing.processingFee,
    exchangeFee: input.pricing.ycLegFeesUsd,
    exchangeRate: input.customerRate,
    residenceCountry: input.residenceCountry,
    payInRail: input.rail,
    displayProcessingFeeLocal: buildYcFundBalanceDisplayFees({
      usdCredit: input.pricing.usdCredit,
      processingFee: input.pricing.processingFee,
      ycLegFeesUsd: input.pricing.ycLegFeesUsd,
      easnerSellRate: input.customerRate,
      payInCurrency: input.currency,
    }).displayProcessingFeeLocal,
  })
  const depositDisplayTitle = resolveYcFundBalanceDepositTitle({
    residenceCountry: input.residenceCountry,
    payInRail: input.rail,
    localCurrency: input.currency,
  })
  return buildYcFundBalanceReceiveMetadata({
    sequenceId: input.sequenceId,
    localPayIn: input.pricing.localPayIn,
    localCurrency: input.currency,
    usdCredit: input.pricing.usdCredit,
    processingFee: input.pricing.processingFee,
    residenceCountry: input.residenceCountry,
    payInRail: input.rail,
    customerRate: input.customerRate,
    depositReview,
    depositDisplayTitle,
    displayHeroTitle: depositDisplayTitle,
  })
}

/** @deprecated MoMo draft flow – quote API replaces this. Routes return 410. */
export async function createFundBalanceDraft(ctx: FundBalanceSessionContext) {
  const { admin, kycUserId, businessId, currency, country, rail, userRow } = ctx
  if (rail !== "mobile_money") {
    throw new FundBalanceSessionError(
      "invalid_rail",
      "Draft is only supported for mobile_money",
      400,
      { rail },
    )
  }

  const prepared = await prepareFundBalanceSession(ctx)
  const sequenceId = `yc_fb_${randomUUID()}`
  const expiresAt = new Date(Date.now() + YC_QUOTE_TTL_MS).toISOString()
  const easnerTransactionId = generateTransactionId()
  const startedAt = new Date().toISOString()
  const residenceCountry = String(userRow?.residence_country ?? country).trim().toUpperCase()
  const displayProcessingFee = computeDisplayProcessingFee({
    processingFee: prepared.provisional.processingFee,
    exchangeFee: prepared.provisional.ycLegFeesUsd,
  })
  const metadata = buildFundBalanceMetadata({
    sequenceId,
    pricing: prepared.provisional,
    currency,
    country,
    rail,
    customerRate: prepared.customerRate,
    residenceCountry,
  })

  const { data: tx } = await admin
    .from("transactions")
    .insert({
      user_id: kycUserId,
      business_id: businessId,
      provider: "yellowcard",
      status: "pending",
      amount: prepared.provisional.usdCredit,
      currency: "USD",
      direction: "in",
      easner_transaction_id: easnerTransactionId,
      occurred_at: startedAt,
      metadata: {
        ...metadata,
        easner_transaction_id: easnerTransactionId,
        quote_locked_at: startedAt,
        transaction_started_at: startedAt,
        pay_in_rail: rail,
      },
    })
    .select("id")
    .single()

  const { data: transferRow } = await admin
    .from("yc_transfers")
    .insert({
      transaction_id: tx?.id ?? null,
      user_id: kycUserId,
      business_id: businessId,
      mode: "fund_balance",
      status: "pending_authorize",
      pay_in_currency: currency,
      receive_currency: "USD",
      quoted_pay_in: prepared.provisional.localPayIn,
      quoted_receive: prepared.provisional.usdCredit,
      customer_rate: prepared.customerRate,
      leg1_sequence_id: sequenceId,
      leg1_channel_id: prepared.channelId,
      metadata: {
        processing_fee: prepared.provisional.processingFee,
        yc_channel_fee_usd: prepared.provisional.ycLegFeesUsd,
        usd_credit: prepared.provisional.usdCredit,
        sender: prepared.sender,
        draft: true,
      },
      expires_at: expiresAt,
    })
    .select("id")
    .single()

  return {
    ok: true as const,
    sequenceId,
    localPayIn: prepared.provisional.localPayIn,
    usdCredit: prepared.provisional.usdCredit,
    customerRate: prepared.customerRate,
    processingFee: prepared.provisional.processingFee,
    ycChannelFeeUsd: prepared.provisional.ycLegFeesUsd,
    displayProcessingFee,
    expiresAt,
    transactionId: easnerTransactionId,
    easnerTransactionId,
    transferId: transferRow?.id ?? null,
  }
}

/** MoMo authorize – submit YC receive with phone + network, finalize draft. */
export async function authorizeFundBalanceDraft(input: {
  admin: SupabaseClient
  kycUserId: string
  transferId: string
  sourcePhone: string
  networkId: string
}) {
  const { admin, kycUserId, transferId, sourcePhone, networkId } = input
  const phone = String(sourcePhone ?? "").trim()
  const netId = String(networkId ?? "").trim()
  if (!phone || !netId) {
    throw new FundBalanceSessionError(
      "momo_source_required",
      "Mobile number and network are required",
      400,
    )
  }

  const { data: transfer } = await admin
    .from("yc_transfers")
    .select("*")
    .eq("id", transferId)
    .eq("user_id", kycUserId)
    .maybeSingle()

  if (!transfer || transfer.mode !== "fund_balance") {
    throw new FundBalanceSessionError("transfer_not_found", "Transfer not found", 404)
  }
  if (String(transfer.status) !== "pending_authorize") {
    throw new FundBalanceSessionError(
      "invalid_transfer_status",
      "Transfer is not awaiting authorization",
      400,
    )
  }
  if (transfer.expires_at && new Date(String(transfer.expires_at)).getTime() <= Date.now()) {
    throw new FundBalanceSessionError("quote_expired", "Quote expired – start again", 400)
  }

  const currency = String(transfer.pay_in_currency ?? "").trim().toUpperCase()
  const sequenceId = String(transfer.leg1_sequence_id ?? "").trim()
  const channelId = String(transfer.leg1_channel_id ?? "").trim()
  const meta = (transfer.metadata || {}) as Record<string, unknown>
  const sender = meta.sender as Record<string, unknown> | undefined
  if (!sequenceId || !sender) {
    throw new FundBalanceSessionError("draft_incomplete", "Draft session is incomplete", 400)
  }

  const { data: userRow } = await admin
    .from("users")
    .select("residence_country")
    .eq("id", kycUserId)
    .maybeSingle()
  const country = String(userRow?.residence_country ?? "").trim().toUpperCase()

  const rates = await listYcRates(admin, { status: "active" })
  const leg = findYcPayInLeg(rates, currency)
  if (!leg?.easner_sell || !leg.yc_buy) {
    throw new FundBalanceSessionError("yc_rate_unavailable", "YC rate unavailable", 400)
  }

  let receiveRes
  try {
    receiveRes = await submitYcReceive({
      sequenceId,
      customerUID: kycUserId,
      channelType: "momo",
      currency,
      country,
      localAmount: Number(transfer.quoted_pay_in),
      recipient: sender,
      payInRail: "mobile_money",
      sourcePhone: phone,
      sourceNetworkId: netId,
      reason: "fund_balance",
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "YC receive submit failed"
    if (message === "deposit_omnibus_solana_address_usd_required") {
      throw new FundBalanceSessionError(
        "yc_settlement_wallet_not_configured",
        message,
        503,
      )
    }
    const parsedMin = parseYcReceiveRejectedMinError(message)
    if (parsedMin) {
      throw new FundBalanceSessionError("yc_amount_below_min", message, 400, {
        minLocalPayIn: parsedMin.minLocalPayIn,
        currency: parsedMin.currency,
      })
    }
    throw new FundBalanceSessionError("yc_receive_rejected", message, 400)
  }

  const submittedLocalAmount = Number(transfer.quoted_pay_in)
  const lockedLocalPayIn = resolveYcLockedLocalPayInFromReceive({
    submittedLocalAmount,
    receiveRes,
    economicsLocalPayIn: submittedLocalAmount,
  })
  const lockedUsdCredit = Number(transfer.quoted_receive ?? 0)
  const receiveLeg = buildYcReceiveLegFromResponse({
    cryptoAmountUsd: Number(receiveRes.settlementInfo?.cryptoAmount ?? 0),
    lockedLocalPayIn,
    customerSellRate: Number(leg.easner_sell),
    networkFeeAmountUsd: Number(receiveRes.networkFeeAmountUSD ?? 0),
    serviceFeeAmountUsd: Number(receiveRes.serviceFeeAmountUSD ?? 0),
  })
  const payInRail =
    String(meta.pay_in_rail ?? "mobile_money").trim() === "bank_transfer"
      ? ("bank_transfer" as const)
      : ("mobile_money" as const)
  const payInCountry = String(meta.pay_in_country ?? country).trim().toUpperCase()
  const processingFeeBps = await quoteFiatProcessingFeeBps(
    admin,
    { countryCode: payInCountry, currencyCode: currency, rail: payInRail },
    "pay_in",
    {
      userId: kycUserId,
      businessId: transfer.business_id ? String(transfer.business_id) : null,
    },
  )
  const pricingRaw = lockedUsdCredit > 0
    ? computeYcFundBalancePricing({
        usdCredit: lockedUsdCredit,
        customerSellRate: Number(leg.easner_sell),
        ycSellRate: Number(leg.yc_buy),
        receiveLeg,
        processingFeeBps,
      })
    : computeYcFundBalancePricing({
        localPayIn: lockedLocalPayIn,
        customerSellRate: Number(leg.easner_sell),
        ycSellRate: Number(leg.yc_buy),
        receiveLeg,
        processingFeeBps,
      })
  const pricing = { ...pricingRaw, localPayIn: lockedLocalPayIn }

  const expiresAt = new Date(Date.now() + YC_QUOTE_TTL_MS).toISOString()
  const residenceCountry = country

  await admin
    .from("yc_transfers")
    .update({
      status: "awaiting_pay_in",
      quoted_pay_in: pricing.localPayIn,
      quoted_receive: pricing.usdCredit,
      leg1_yc_id: receiveRes.id ?? null,
      leg1_channel_id: (readYcResponseChannelId(receiveRes) ?? channelId) || null,
      bank_info: receiveRes.bankInfo ?? null,
      settlement_info: receiveRes.settlementInfo ?? null,
      expires_at: expiresAt,
      metadata: {
        ...meta,
        processing_fee: pricing.processingFee,
        yc_channel_fee_usd: pricing.ycLegFeesUsd,
        usd_credit: pricing.usdCredit,
        source_phone: phone,
        source_network_id: netId,
        draft: false,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", transferId)

  if (transfer.transaction_id) {
    const { data: txRow } = await admin
      .from("transactions")
      .select("easner_transaction_id,metadata")
      .eq("id", transfer.transaction_id)
      .maybeSingle()
    const prior = (txRow?.metadata || {}) as Record<string, unknown>
    const updatedMeta = buildFundBalanceMetadata({
      sequenceId,
      pricing,
      currency,
      country,
      rail: "mobile_money",
      customerRate: Number(leg.easner_sell),
      residenceCountry,
    })
    await admin
      .from("transactions")
      .update({
        amount: pricing.usdCredit,
        metadata: {
          ...prior,
          ...updatedMeta,
          pay_in_rail: "mobile_money",
          source_phone: phone,
          source_network_id: netId,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", transfer.transaction_id)
  }

  const { data: txRow } = transfer.transaction_id
    ? await admin
        .from("transactions")
        .select("easner_transaction_id")
        .eq("id", transfer.transaction_id)
        .maybeSingle()
    : { data: null }

  return {
    ok: true as const,
    transactionId: txRow?.easner_transaction_id ?? null,
    localPayIn: pricing.localPayIn,
    usdCredit: pricing.usdCredit,
    expiresAt,
    transferId,
  }
}

/** Shared prep for bank quote route (re-export prepare for quote route refactor). */
export { prepareFundBalanceSession, buildFundBalanceMetadata }

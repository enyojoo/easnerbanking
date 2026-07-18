import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  YC_QUOTE_TTL_MS,
  YC_FUND_BALANCE_OMNIBUS_TOLERANCE_USDC,
  YC_FUND_BALANCE_RECEIVE_MAX_ATTEMPTS,
  buildYcFundBalanceDepositReviewSnapshot,
  buildYcFundBalanceDisplayFees,
  bumpYcFundBalanceLocalPayInForOmnibusShortfall,
  checkYcFundBalanceOmnibusSufficient,
  computeYcFundBalancePricing,
  computeYcFundBalancePricingBeforeReceive,
  inferYcReceiveLegFeesUsd,
  parseYcReceiveRejectedMinError,
  resolveYcFundBalanceDepositTitle,
  resolveYcFundBalanceSubmitLocalPayIn,
  resolveYcPayInLimits,
  ycPayInInstructionNotice,
} from "@easner/shared"
import { findYcPayInLeg, listYcRates } from "@/lib/fx/yc-rates"
import { submitYcReceive, type YcReceiveSubmitResult } from "@/lib/yellowcard/receive-submit"
import { buildYcKycPersonMetadata } from "@/lib/yellowcard/kyc-metadata"
import { listYellowcardChannels } from "@/lib/yellowcard/channels"
import { buildYcFundBalanceReceiveMetadata } from "@/lib/yellowcard/yc-ledger"
import { isYcLocalPayInEnabledForCorridor } from "@/lib/yellowcard/yc-receive-gate"
import { depositOmnibusSolanaAddressUsd } from "@/lib/deposit-omnibus/config"
import { generateTransactionId } from "@/lib/transaction-id"
import { findYcReceiveChannel } from "@/lib/yellowcard/receive-rails"
import { mapKycErrorToCode } from "@/lib/yellowcard/fund-balance-quote-errors"
import { buildFundBalanceQuoteSummary } from "@/lib/yellowcard/build-yc-quote-response"
import { validateFundBalancePayInAmountLimits } from "@/lib/pay-in-limit-check"
import { buildYcQuoteKey, findReusableYcTransfer } from "@/lib/yellowcard/quote-key"

export type FundBalanceRail = "bank_transfer" | "mobile_money"

export type FundBalanceQuoteInput = {
  admin: SupabaseClient
  kycUserId: string
  businessId: string | null
  currency: string
  country: string
  rail: FundBalanceRail
  usdCredit?: number
  localPayIn?: number
  sourcePhone?: string
  sourceNetworkId?: string
  sourceNetworkName?: string
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

export class FundBalanceQuoteServiceError extends Error {
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

async function prepareFundBalanceQuote(ctx: FundBalanceQuoteInput) {
  const { admin, kycUserId, currency, country, rail, userRow } = ctx

  const [rates, payInEnabled, channels] = await Promise.all([
    listYcRates(admin, { status: "active" }),
    isYcLocalPayInEnabledForCorridor(admin, {
      countryCode: country,
      currencyCode: currency,
      rail,
    }),
    listYellowcardChannels(),
  ])

  const leg = findYcPayInLeg(rates, currency)
  if (!leg?.easner_sell || !leg.yc_sell) {
    throw new FundBalanceQuoteServiceError(
      "yc_rate_unavailable",
      "YC rate unavailable for currency",
      400,
      { userId: kycUserId, currency, country },
    )
  }

  if (!payInEnabled) {
    throw new FundBalanceQuoteServiceError(
      "yc_corridor_disabled",
      "Local pay-in is not enabled for this corridor",
      403,
      { userId: kycUserId, currency, country, rail },
    )
  }

  if (!depositOmnibusSolanaAddressUsd()) {
    throw new FundBalanceQuoteServiceError(
      "yc_settlement_wallet_not_configured",
      "deposit_omnibus_solana_address_usd_required",
      503,
      {
        hint: "Set DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD on the business API (USDC Solana omnibus for YC pay-in settlement).",
      },
    )
  }

  const channel = findYcReceiveChannel(channels, { country, currency, rail })
  const channelId = String(channel?.id ?? channel?.channelId ?? "").trim()
  if (!channelId) {
    throw new FundBalanceQuoteServiceError(
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
    throw new FundBalanceQuoteServiceError(
      mapKycErrorToCode(message),
      message,
      400,
      { userId: kycUserId, currency, country, rail },
    )
  }

  const customerSellRate = Number(leg.easner_sell)
  const ycSellRate = Number(leg.yc_sell)

  const provisional = computeYcFundBalancePricingBeforeReceive({
    usdCredit: ctx.usdCredit,
    localPayIn: ctx.localPayIn,
    customerSellRate,
    ycSellRate,
    rail,
  })

  const amountCheck = await validateFundBalancePayInAmountLimits({
    admin,
    countryCode: country,
    currencyCode: currency,
    rail,
    localPayIn: provisional.localPayIn,
  })
  if (!amountCheck.ok) {
    const belowMin =
      payInLimits.minLocalPayIn != null && provisional.localPayIn < payInLimits.minLocalPayIn
    const aboveMax =
      payInLimits.maxLocalPayIn != null && provisional.localPayIn > payInLimits.maxLocalPayIn
    throw new FundBalanceQuoteServiceError(
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

  const quoteKey = buildYcQuoteKey({
    mode: "fund_balance",
    userId: kycUserId,
    currency,
    country,
    rail,
    usdCredit: ctx.usdCredit ?? null,
    localPayIn: ctx.localPayIn ?? null,
    sourcePhone: ctx.sourcePhone ?? null,
    sourceNetworkId: ctx.sourceNetworkId ?? null,
  })

  return {
    leg,
    channelId,
    sender,
    provisional,
    customerRate: customerSellRate,
    quoteKey,
  }
}

function buildFundBalanceReceiveLeg(input: {
  receiveRes: YcReceiveSubmitResult
  customerSellRate: number
  fallbackLocalPayIn: number
}) {
  const cryptoAmountUsd = Number(input.receiveRes.settlementInfo?.cryptoAmount ?? 0)
  const lockedLocalPayIn = Number(input.receiveRes.localAmount ?? input.fallbackLocalPayIn)
  const networkFeeAmountUsd = Number(input.receiveRes.networkFeeAmountUSD ?? 0)
  const serviceFeeAmountUsd = Number(input.receiveRes.serviceFeeAmountUSD ?? 0)
  const inferredFees = inferYcReceiveLegFeesUsd({
    lockedLocalPayIn,
    customerSellRate: input.customerSellRate,
    cryptoAmountUsd,
    networkFeeAmountUsd,
    serviceFeeAmountUsd,
  })
  return {
    cryptoAmountUsd,
    networkFeeAmountUsd: networkFeeAmountUsd > 0 ? networkFeeAmountUsd : inferredFees,
    serviceFeeAmountUsd,
  }
}

function computeFundBalancePricingFromReceive(input: {
  ctx: FundBalanceQuoteInput
  prepared: Awaited<ReturnType<typeof prepareFundBalanceQuote>>
  receiveRes: YcReceiveSubmitResult
}) {
  const receiveLeg = buildFundBalanceReceiveLeg({
    receiveRes: input.receiveRes,
    customerSellRate: input.prepared.customerRate,
    fallbackLocalPayIn: input.prepared.provisional.localPayIn,
  })
  const usdCreditTarget = input.ctx.usdCredit != null && Number(input.ctx.usdCredit) > 0
  return usdCreditTarget
    ? computeYcFundBalancePricing({
        usdCredit: input.prepared.provisional.usdCredit,
        customerSellRate: input.prepared.customerRate,
        ycSellRate: Number(input.prepared.leg.yc_sell),
        receiveLeg,
      })
    : computeYcFundBalancePricing({
        localPayIn: Number(
          input.receiveRes.localAmount ?? input.prepared.provisional.localPayIn,
        ),
        customerSellRate: input.prepared.customerRate,
        ycSellRate: Number(input.prepared.leg.yc_sell),
        receiveLeg,
      })
}

async function submitFundBalanceYcReceive(input: {
  ctx: FundBalanceQuoteInput
  prepared: Awaited<ReturnType<typeof prepareFundBalanceQuote>>
}): Promise<{ receiveRes: YcReceiveSubmitResult; pricing: ReturnType<typeof computeYcFundBalancePricing>; sequenceId: string }> {
  let localAmount = resolveYcFundBalanceSubmitLocalPayIn({
    pricing: input.prepared.provisional,
    customerSellRate: input.prepared.customerRate,
  })
  let sequenceId = `yc_fb_${randomUUID()}`

  for (let attempt = 0; attempt < YC_FUND_BALANCE_RECEIVE_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      sequenceId = `yc_fb_${randomUUID()}`
    }

    let receiveRes: YcReceiveSubmitResult
    try {
      receiveRes = await submitYcReceive({
        sequenceId,
        customerUID: input.ctx.kycUserId,
        channelId: input.prepared.channelId,
        currency: input.ctx.currency,
        country: input.ctx.country,
        localAmount,
        recipient: input.prepared.sender,
        payInRail: input.ctx.rail,
        sourcePhone: input.ctx.sourcePhone,
        sourceNetworkId: input.ctx.sourceNetworkId,
        reason: "fund_balance",
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : "YC receive submit failed"
      if (message === "deposit_omnibus_solana_address_usd_required") {
        throw new FundBalanceQuoteServiceError("yc_settlement_wallet_not_configured", message, 503)
      }
      const parsedMin = parseYcReceiveRejectedMinError(message)
      if (parsedMin) {
        throw new FundBalanceQuoteServiceError("yc_amount_below_min", message, 400, {
          minLocalPayIn: parsedMin.minLocalPayIn,
          currency: parsedMin.currency,
        })
      }
      throw new FundBalanceQuoteServiceError("yc_receive_rejected", message, 400, {
        userId: input.ctx.kycUserId,
        currency: input.ctx.currency,
        country: input.ctx.country,
        rail: input.ctx.rail,
      })
    }

    const pricing = computeFundBalancePricingFromReceive({
      ctx: input.ctx,
      prepared: input.prepared,
      receiveRes,
    })

    const cryptoAmount = Number(receiveRes.settlementInfo?.cryptoAmount ?? 0)
    const omnibusCheck = checkYcFundBalanceOmnibusSufficient({
      cryptoAmount,
      usdCredit: pricing.usdCredit,
      processingFee: pricing.processingFee,
      tolerance: YC_FUND_BALANCE_OMNIBUS_TOLERANCE_USDC,
    })

    if (omnibusCheck.ok) {
      return { receiveRes, pricing, sequenceId }
    }

    if (attempt < YC_FUND_BALANCE_RECEIVE_MAX_ATTEMPTS - 1) {
      const ycLockedPayIn = Number(receiveRes.localAmount ?? localAmount)
      localAmount = bumpYcFundBalanceLocalPayInForOmnibusShortfall({
        localPayIn: Math.max(localAmount, ycLockedPayIn, pricing.localPayIn),
        customerSellRate: input.prepared.customerRate,
        requiredOmnibus: omnibusCheck.requiredOmnibus,
        cryptoAmount: omnibusCheck.cryptoAmount,
      })
      continue
    }

    throw new FundBalanceQuoteServiceError(
      "yc_omnibus_below_required",
      `YC omnibus ${cryptoAmount} below required ${omnibusCheck.requiredOmnibus}`,
      400,
      {
        userId: input.ctx.kycUserId,
        currency: input.ctx.currency,
        country: input.ctx.country,
        rail: input.ctx.rail,
        cryptoAmount,
        requiredOmnibus: omnibusCheck.requiredOmnibus,
      },
    )
  }

  throw new FundBalanceQuoteServiceError("yc_receive_rejected", "YC receive submit failed", 400)
}

function formatFundBalanceTransferResponse(input: {
  transfer: Record<string, unknown>
  transactionEasnerId: string | null
  pricing: ReturnType<typeof computeYcFundBalancePricing>
  currency: string
  customerRate: number
  rail: FundBalanceRail
  sourcePhone?: string
  sourceNetworkId?: string
  sourceNetworkName?: string
  sequenceId?: string
}) {
  const expiresAt = String(input.transfer.expires_at ?? new Date(Date.now() + YC_QUOTE_TTL_MS).toISOString())
  const bankInfo = (input.transfer.bank_info as Record<string, unknown> | null) ?? null
  const summary = buildFundBalanceQuoteSummary({
    pricing: input.pricing,
    currency: input.currency,
    customerRate: input.customerRate,
    rail: input.rail,
    expiresAt,
    transactionId: input.transactionEasnerId ?? "",
    transferId: String(input.transfer.id ?? ""),
    bankInfo,
    sourcePhone: input.sourcePhone,
    sourceNetworkId: input.sourceNetworkId,
    sourceNetworkName: input.sourceNetworkName,
  })

  return {
    ...summary,
    quotePhase: "locked" as const,
    sequenceId: input.sequenceId ?? String(input.transfer.leg1_sequence_id ?? ""),
    easnerTransactionId: input.transactionEasnerId,
    bankInfo,
    payInNotice: ycPayInInstructionNotice(input.rail),
  }
}

/** Indicative pricing only — no YC API calls, no DB rows. */
export async function previewFundBalanceQuote(ctx: FundBalanceQuoteInput) {
  const prepared = await prepareFundBalanceQuote(ctx)
  const expiresAt = new Date(Date.now() + YC_QUOTE_TTL_MS).toISOString()

  const summary = buildFundBalanceQuoteSummary({
    pricing: prepared.provisional,
    currency: ctx.currency,
    customerRate: prepared.customerRate,
    rail: ctx.rail,
    expiresAt,
    transactionId: "",
    transferId: "",
    bankInfo: null,
    sourcePhone: ctx.sourcePhone,
    sourceNetworkId: ctx.sourceNetworkId,
    sourceNetworkName: ctx.sourceNetworkName,
  })

  return {
    ...summary,
    quotePhase: "preview" as const,
    quoteKey: prepared.quoteKey,
    requiresConfirm: true,
    payInNotice: ycPayInInstructionNotice(ctx.rail),
  }
}

/** Lock YC receive + create ledger rows after user confirms review. Idempotent by quoteKey. */
export async function confirmFundBalanceOrder(ctx: FundBalanceQuoteInput) {
  const prepared = await prepareFundBalanceQuote(ctx)

  const existing = await findReusableYcTransfer(ctx.admin, {
    userId: ctx.kycUserId,
    mode: "fund_balance",
    quoteKey: prepared.quoteKey,
  })
  if (existing?.id) {
    const meta = (existing.metadata || {}) as Record<string, unknown>
    let transactionEasnerId: string | null = null
    if (existing.transaction_id) {
      const { data: txRow } = await ctx.admin
        .from("transactions")
        .select("easner_transaction_id")
        .eq("id", String(existing.transaction_id))
        .maybeSingle()
      transactionEasnerId = txRow?.easner_transaction_id
        ? String(txRow.easner_transaction_id)
        : null
    }
    return formatFundBalanceTransferResponse({
      transfer: existing,
      transactionEasnerId,
      pricing: computeYcFundBalancePricing({
        usdCredit: Number(existing.quoted_receive ?? meta.usd_credit ?? 0),
        localPayIn: Number(existing.quoted_pay_in ?? 0),
        customerSellRate: prepared.customerRate,
        ycSellRate: Number(prepared.leg.yc_sell),
        receiveLeg: { cryptoAmountUsd: 0 },
      }),
      currency: ctx.currency,
      customerRate: Number(existing.customer_rate ?? prepared.customerRate),
      rail: ctx.rail,
      sourcePhone: ctx.sourcePhone,
      sourceNetworkId: ctx.sourceNetworkId,
      sourceNetworkName: ctx.sourceNetworkName,
      sequenceId: String(existing.leg1_sequence_id ?? ""),
    })
  }

  const { receiveRes, pricing, sequenceId: finalSequenceId } = await submitFundBalanceYcReceive({
    ctx,
    prepared,
  })
  const lockedLocalPayIn = Number(receiveRes.localAmount ?? pricing.localPayIn)
  const omnibusInExpected = Number(receiveRes.settlementInfo?.cryptoAmount ?? pricing.omnibusInUsd)

  const expiresAt = new Date(Date.now() + YC_QUOTE_TTL_MS).toISOString()
  const easnerTransactionId = generateTransactionId()
  const startedAt = new Date().toISOString()
  const residenceCountry = String(ctx.userRow?.residence_country ?? ctx.country).trim().toUpperCase()
  const displayFeesPreview = buildYcFundBalanceDisplayFees({
    usdCredit: pricing.usdCredit,
    processingFee: pricing.processingFee,
    ycLegFeesUsd: pricing.ycLegFeesUsd,
    easnerSellRate: prepared.customerRate,
    payInCurrency: ctx.currency,
  })
  const depositReview = buildYcFundBalanceDepositReviewSnapshot({
    localPayIn: lockedLocalPayIn,
    localCurrency: ctx.currency,
    usdCredit: pricing.usdCredit,
    processingFee: pricing.processingFee,
    exchangeFee: pricing.ycLegFeesUsd,
    exchangeRate: prepared.customerRate,
    residenceCountry,
    payInRail: ctx.rail,
    displayProcessingFeeLocal: displayFeesPreview.displayProcessingFeeLocal,
  })
  const depositDisplayTitle = resolveYcFundBalanceDepositTitle({
    residenceCountry,
    payInRail: ctx.rail,
    localCurrency: ctx.currency,
  })
  const metadata = buildYcFundBalanceReceiveMetadata({
    sequenceId: finalSequenceId,
    localPayIn: lockedLocalPayIn,
    localCurrency: ctx.currency,
    usdCredit: pricing.usdCredit,
    processingFee: pricing.processingFee,
    residenceCountry,
    payInRail: ctx.rail,
    customerRate: prepared.customerRate,
    depositReview,
    depositDisplayTitle,
    displayHeroTitle: depositDisplayTitle,
  })

  const { data: tx } = await ctx.admin
    .from("transactions")
    .insert({
      user_id: ctx.kycUserId,
      business_id: ctx.businessId,
      provider: "yellowcard",
      provider_transaction_id: finalSequenceId,
      status: "pending",
      amount: pricing.usdCredit,
      currency: "USD",
      direction: "in",
      easner_transaction_id: easnerTransactionId,
      occurred_at: startedAt,
      metadata: {
        ...metadata,
        easner_transaction_id: easnerTransactionId,
        processing_at: startedAt,
        transaction_started_at: startedAt,
        pay_in_rail: ctx.rail,
        display_processing_fee: displayFeesPreview.displayProcessingFee,
        display_processing_fee_local: displayFeesPreview.displayProcessingFeeLocal,
        yc_leg_fees_usd: pricing.ycLegFeesUsd,
        margin_amount: pricing.marginAmount,
        omnibus_in_expected: omnibusInExpected,
        margin_capture_mode: "fee_wallet_omnibus",
        ...(ctx.sourcePhone ? { source_phone: ctx.sourcePhone } : {}),
        ...(ctx.sourceNetworkId ? { source_network_id: ctx.sourceNetworkId } : {}),
      },
    })
    .select("id")
    .single()

  const { data: transferRow } = await ctx.admin
    .from("yc_transfers")
    .insert({
      transaction_id: tx?.id ?? null,
      user_id: ctx.kycUserId,
      business_id: ctx.businessId,
      mode: "fund_balance",
      status: "awaiting_pay_in",
      pay_in_currency: ctx.currency,
      receive_currency: "USD",
      quoted_pay_in: lockedLocalPayIn,
      quoted_receive: pricing.usdCredit,
      customer_rate: prepared.customerRate,
      leg1_sequence_id: finalSequenceId,
      leg1_yc_id: receiveRes.id ?? null,
      leg1_channel_id: prepared.channelId,
      bank_info: receiveRes.bankInfo ?? null,
      settlement_info: receiveRes.settlementInfo ?? null,
      metadata: {
        quote_key: prepared.quoteKey,
        processing_fee: pricing.processingFee,
        yc_channel_fee_usd: pricing.ycLegFeesUsd,
        yc_leg_fees_usd: pricing.ycLegFeesUsd,
        display_processing_fee: displayFeesPreview.displayProcessingFee,
        display_processing_fee_local: displayFeesPreview.displayProcessingFeeLocal,
        usd_credit: pricing.usdCredit,
        margin_amount: pricing.marginAmount,
        omnibus_in_expected: omnibusInExpected,
        margin_capture_mode: "fee_wallet_omnibus",
        ...(ctx.sourcePhone
          ? { source_phone: ctx.sourcePhone, source_network_id: ctx.sourceNetworkId }
          : {}),
      },
      expires_at: expiresAt,
    })
    .select("*")
    .single()

  return formatFundBalanceTransferResponse({
    transfer: (transferRow ?? {}) as Record<string, unknown>,
    transactionEasnerId: easnerTransactionId,
    pricing,
    currency: ctx.currency,
    customerRate: prepared.customerRate,
    rail: ctx.rail,
    sourcePhone: ctx.sourcePhone,
    sourceNetworkId: ctx.sourceNetworkId,
    sourceNetworkName: ctx.sourceNetworkName,
    sequenceId: finalSequenceId,
  })
}

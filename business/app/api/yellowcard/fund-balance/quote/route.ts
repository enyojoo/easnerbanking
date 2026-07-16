import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { requireAuth, resolveNoahContextAsync } from "@/app/api/noah/_helpers"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { computeYcFundBalancePricing, YC_QUOTE_TTL_MS, computeDisplayProcessingFee, ycPayInInstructionNotice, parseYcReceiveRejectedMinError, resolveYcPayInLimits, validateYcPayInLocalAmount, buildYcFundBalanceDepositReviewSnapshot, resolveYcFundBalanceDepositTitle } from "@easner/shared"
import { findYcPayInLeg, listYcRates } from "@/lib/fx/yc-rates"
import { submitYcReceive } from "@/lib/yellowcard/receive-submit"
import { buildYcKycPersonMetadata } from "@/lib/yellowcard/kyc-metadata"
import { listYellowcardChannels } from "@/lib/yellowcard/channels"
import { buildYcFundBalanceReceiveMetadata } from "@/lib/yellowcard/yc-ledger"
import { isYcLocalPayInEnabledForCorridor } from "@/lib/yellowcard/yc-receive-gate"
import { depositOmnibusSolanaAddressUsd } from "@/lib/deposit-omnibus/config"
import { generateTransactionId } from "@/lib/transaction-id"
import { findYcReceiveChannel } from "@/lib/yellowcard/receive-rails"
import {
  mapKycErrorToCode,
  ycFundBalanceQuoteError,
} from "@/lib/yellowcard/fund-balance-quote-errors"

export const runtime = "nodejs"

function ycSettlementConfigErrorResponse(message: string) {
  return ycFundBalanceQuoteError(
    "yc_settlement_wallet_not_configured",
    message,
    503,
    {
      hint: "Set DEPOSIT_OMNIBUS_SOLANA_ADDRESS_USD on the business API (USDC Solana omnibus for YC pay-in settlement).",
    },
  )
}

/**
 * Create a YC local fund_balance receive session (dynamic VA / MoMo).
 * Supports individual + business scope (org owner KYC for YC person metadata).
 */
export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const noahCtxResult = await resolveNoahContextAsync(user.id, request)
  if (!noahCtxResult.ok) return noahCtxResult.response
  const noahCtx = noahCtxResult

  const body = (await request.json().catch(() => null)) as {
    currency?: string
    country?: string
    usdCredit?: number
    localPayIn?: number
    rail?: "bank_transfer" | "mobile_money"
  } | null

  const currency = String(body?.currency ?? "").trim().toUpperCase()
  const country = String(body?.country ?? "").trim().toUpperCase()
  if (!currency || !country) {
    return ycFundBalanceQuoteError(
      "currency_country_required",
      "currency and country required",
      400,
      { userId: user.id },
    )
  }

  const admin = createSupabaseAdmin()
  const orgOwnerId =
    noahCtx.scope === "business" && noahCtx.businessId
      ? await resolveBusinessOrgOwnerUserId(admin, noahCtx.businessId).catch(() => null)
      : null
  const kycUserId = orgOwnerId ?? user.id

  const { data: userRow } = await admin
    .from("users")
    .select(
      "residence_country,kyc_id_type,kyc_id_number,ng_local_id_type,ng_local_id_number,full_name,phone,email,date_of_birth,kyc_address_street,kyc_address_city,kyc_address_country",
    )
    .eq("id", kycUserId)
    .maybeSingle()

  const rates = await listYcRates(admin, { status: "active" })
  const leg = findYcPayInLeg(rates, currency)
  if (!leg?.easner_sell || !leg.yc_sell) {
    return ycFundBalanceQuoteError(
      "yc_rate_unavailable",
      "YC rate unavailable for currency",
      400,
      { userId: kycUserId, currency, country },
    )
  }

  const rail = body?.rail === "mobile_money" ? "mobile_money" : "bank_transfer"

  const payInEnabled = await isYcLocalPayInEnabledForCorridor(admin, {
    countryCode: country,
    currencyCode: currency,
    rail,
  })
  if (!payInEnabled) {
    return ycFundBalanceQuoteError(
      "yc_corridor_disabled",
      "Local pay-in is not enabled for this corridor",
      403,
      { userId: kycUserId, currency, country, rail },
    )
  }

  if (!depositOmnibusSolanaAddressUsd()) {
    return ycSettlementConfigErrorResponse("deposit_omnibus_solana_address_usd_required")
  }

  const channels = await listYellowcardChannels()
  const channel = findYcReceiveChannel(channels, { country, currency, rail })
  const channelId = String(channel?.id ?? channel?.channelId ?? "").trim()
  if (!channelId) {
    return ycFundBalanceQuoteError(
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
    return ycFundBalanceQuoteError(
      mapKycErrorToCode(message),
      message,
      400,
      { userId: kycUserId, currency, country, rail },
    )
  }

  const provisional = computeYcFundBalancePricing({
    usdCredit: body?.usdCredit,
    localPayIn: body?.localPayIn,
    customerSellRate: Number(leg.easner_sell),
    ycSellRate: Number(leg.yc_sell),
    receiveLeg: { cryptoAmountUsd: 0 },
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
    return ycFundBalanceQuoteError(
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

  const sequenceId = `yc_fb_${randomUUID()}`
  let receiveRes
  try {
    receiveRes = await submitYcReceive({
      sequenceId,
      customerUID: kycUserId,
      channelId,
      currency,
      country,
      localAmount: provisional.localPayIn,
      recipient: sender,
      payInRail: rail,
      sourcePhone: userRow?.phone,
      reason: "fund_balance",
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "YC receive submit failed"
    if (message === "deposit_omnibus_solana_address_usd_required") {
      return ycSettlementConfigErrorResponse(message)
    }
    const parsedMin = parseYcReceiveRejectedMinError(message)
    if (parsedMin) {
      return ycFundBalanceQuoteError("yc_amount_below_min", message, 400, {
        userId: kycUserId,
        currency: parsedMin.currency,
        country,
        rail,
        minLocalPayIn: parsedMin.minLocalPayIn,
      })
    }
    return ycFundBalanceQuoteError("yc_receive_rejected", message, 400, {
      userId: kycUserId,
      currency,
      country,
      rail,
    })
  }

  const pricing = computeYcFundBalancePricing({
    localPayIn: Number(receiveRes.localAmount ?? provisional.localPayIn),
    customerSellRate: Number(leg.easner_sell),
    ycSellRate: Number(leg.yc_sell),
    receiveLeg: {
      cryptoAmountUsd: Number(receiveRes.settlementInfo?.cryptoAmount ?? 0),
      networkFeeAmountUsd: Number(receiveRes.networkFeeAmountUSD ?? 0),
      serviceFeeAmountUsd: Number(receiveRes.serviceFeeAmountUSD ?? 0),
    },
  })

  const displayProcessingFee = computeDisplayProcessingFee({
    processingFee: pricing.processingFee,
    exchangeFee: pricing.ycLegFeesUsd,
  })

  const expiresAt = new Date(Date.now() + YC_QUOTE_TTL_MS).toISOString()
  const businessId = noahCtx.scope === "business" ? noahCtx.businessId : null
  const easnerTransactionId = generateTransactionId()
  const startedAt = new Date().toISOString()
  const residenceCountry = String(userRow?.residence_country ?? country).trim().toUpperCase()
  const customerRate = Number(leg.easner_sell)
  const depositReview = buildYcFundBalanceDepositReviewSnapshot({
    localPayIn: pricing.localPayIn,
    localCurrency: currency,
    usdCredit: pricing.usdCredit,
    processingFee: pricing.processingFee,
    exchangeFee: pricing.ycLegFeesUsd,
    exchangeRate: customerRate,
    residenceCountry,
    payInRail: rail,
  })
  const depositDisplayTitle = resolveYcFundBalanceDepositTitle({
    residenceCountry,
    payInRail: rail,
    localCurrency: currency,
  })
  const metadata = buildYcFundBalanceReceiveMetadata({
    sequenceId,
    localPayIn: pricing.localPayIn,
    localCurrency: currency,
    usdCredit: pricing.usdCredit,
    processingFee: pricing.processingFee,
    residenceCountry,
    payInRail: rail,
    customerRate,
    depositReview,
    depositDisplayTitle,
    displayHeroTitle: depositDisplayTitle,
  })

  const { data: tx } = await admin
    .from("transactions")
    .insert({
      user_id: kycUserId,
      business_id: businessId,
      provider: "yellowcard",
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
      status: "awaiting_pay_in",
      pay_in_currency: currency,
      receive_currency: "USD",
      quoted_pay_in: pricing.localPayIn,
      quoted_receive: pricing.usdCredit,
      customer_rate: Number(leg.easner_sell),
      leg1_sequence_id: sequenceId,
      leg1_yc_id: receiveRes.id ?? null,
      leg1_channel_id: channelId,
      bank_info: receiveRes.bankInfo ?? null,
      settlement_info: receiveRes.settlementInfo ?? null,
      metadata: { processing_fee: pricing.processingFee, yc_channel_fee_usd: pricing.ycLegFeesUsd, usd_credit: pricing.usdCredit },
      expires_at: expiresAt,
    })
    .select("id")
    .single()

  return NextResponse.json({
    ok: true,
    sequenceId,
    localPayIn: pricing.localPayIn,
    usdCredit: pricing.usdCredit,
    customerRate: Number(leg.easner_sell),
    bankInfo: receiveRes.bankInfo ?? null,
    processingFee: pricing.processingFee,
    ycChannelFeeUsd: pricing.ycLegFeesUsd,
    displayProcessingFee,
    expiresAt,
    transactionId: easnerTransactionId,
    easnerTransactionId,
    transferId: transferRow?.id ?? receiveRes.id ?? null,
    payInNotice: ycPayInInstructionNotice(rail),
  })
}

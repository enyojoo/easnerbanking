import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  resolveYcQuoteExpiresAt,
  resolveYcPayInDepositExpiresAt,
  YC_FUND_BALANCE_OMNIBUS_TOLERANCE_USDC,
  YC_FUND_BALANCE_RECEIVE_MAX_ATTEMPTS,
  buildYcFundBalanceDepositReviewSnapshot,
  buildYcFundBalanceDisplayFees,
  bumpYcFundBalanceLocalPayInForOmnibusShortfall,
  checkYcFundBalanceOmnibusSufficient,
  computeYcFundBalancePricing,
  computeYcFundBalancePricingBeforeReceive,
  buildYcReceiveLegFromResponse,
  parseYcReceiveRejectedMinError,
  resolveYcFundBalanceDepositTitle,
  resolveYcFundBalanceSubmitLocalPayIn,
  resolveYcLockedLocalPayInFromReceive,
  resolveYcPayInLimits,
  ycPayInInstructionNotice,
} from "@easner/shared"
import { findYcPayInLeg, listYcRates } from "@/lib/fx/yc-rates"
import {
  hydrateYcReceiveBankInfo,
  resolveYcBankInfoName,
  submitYcReceive,
  type YcReceiveSubmitResult,
} from "@/lib/yellowcard/receive-submit"
import { buildYcKycPersonMetadata } from "@/lib/yellowcard/kyc-metadata"
import {
  listYellowcardChannels,
  readYcResponseChannelId,
  toYcChannelType,
} from "@/lib/yellowcard/channels"
import { buildYcFundBalanceReceiveMetadata } from "@/lib/yellowcard/yc-ledger"
import { isYcLocalPayInEnabledForCorridor } from "@/lib/yellowcard/yc-receive-gate"
import { depositOmnibusSolanaAddressUsd } from "@/lib/deposit-omnibus/config"
import { generateTransactionId } from "@/lib/transaction-id"
import { findYcReceiveChannel } from "@/lib/yellowcard/receive-rails"
import { mapKycErrorToCode } from "@/lib/yellowcard/fund-balance-quote-errors"
import { buildFundBalanceQuoteSummary } from "@/lib/yellowcard/build-yc-quote-response"
import { validateFundBalancePayInAmountLimits } from "@/lib/pay-in-limit-check"
import { buildYcQuoteKey, findReusableYcTransfer } from "@/lib/yellowcard/quote-key"
import { logYcTiming } from "@/lib/yellowcard/timing"
import { quoteFiatProcessingFeeBps } from "@/lib/processing-fee/quote-processing-fee-bps"

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
  if (!leg?.easner_sell || !leg.yc_buy) {
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
  const ycSellRate = Number(leg.yc_buy)

  const processingFeeBps = await quoteFiatProcessingFeeBps(
    admin,
    { countryCode: country, currencyCode: currency, rail },
    "pay_in",
    { userId: kycUserId, businessId: ctx.businessId },
  )

  const provisional = computeYcFundBalancePricingBeforeReceive({
    usdCredit: ctx.usdCredit,
    localPayIn: ctx.localPayIn,
    customerSellRate,
    ycSellRate,
    rail,
    processingFeeBps,
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
    processingFeeBps,
  }
}

function buildFundBalanceReceiveLeg(input: {
  receiveRes: YcReceiveSubmitResult
  customerSellRate: number
  submittedLocalAmount: number
  fallbackLocalPayIn: number
}) {
  const lockedLocalPayIn = resolveYcLockedLocalPayInFromReceive({
    submittedLocalAmount: input.submittedLocalAmount,
    receiveRes: input.receiveRes,
    economicsLocalPayIn: input.fallbackLocalPayIn,
  })
  return buildYcReceiveLegFromResponse({
    cryptoAmountUsd: Number(input.receiveRes.settlementInfo?.cryptoAmount ?? 0),
    lockedLocalPayIn,
    customerSellRate: input.customerSellRate,
    networkFeeAmountUsd: Number(input.receiveRes.networkFeeAmountUSD ?? 0),
    serviceFeeAmountUsd: Number(input.receiveRes.serviceFeeAmountUSD ?? 0),
  })
}

function computeFundBalancePricingFromReceive(input: {
  ctx: FundBalanceQuoteInput
  prepared: Awaited<ReturnType<typeof prepareFundBalanceQuote>>
  receiveRes: YcReceiveSubmitResult
  submittedLocalAmount: number
}) {
  const receiveLeg = buildFundBalanceReceiveLeg({
    receiveRes: input.receiveRes,
    customerSellRate: input.prepared.customerRate,
    submittedLocalAmount: input.submittedLocalAmount,
    fallbackLocalPayIn: input.prepared.provisional.localPayIn,
  })
  const usdCreditTarget = input.ctx.usdCredit != null && Number(input.ctx.usdCredit) > 0
  return usdCreditTarget
    ? computeYcFundBalancePricing({
        usdCredit: input.prepared.provisional.usdCredit,
        customerSellRate: input.prepared.customerRate,
        ycSellRate: Number(input.prepared.leg.yc_buy),
        receiveLeg,
        processingFeeBps: input.prepared.processingFeeBps,
      })
    : computeYcFundBalancePricing({
        localPayIn: resolveYcLockedLocalPayInFromReceive({
          submittedLocalAmount: input.submittedLocalAmount,
          receiveRes: input.receiveRes,
          economicsLocalPayIn: input.prepared.provisional.localPayIn,
        }),
        customerSellRate: input.prepared.customerRate,
        ycSellRate: Number(input.prepared.leg.yc_buy),
        receiveLeg,
        processingFeeBps: input.prepared.processingFeeBps,
      })
}

async function submitFundBalanceYcReceive(input: {
  ctx: FundBalanceQuoteInput
  prepared: Awaited<ReturnType<typeof prepareFundBalanceQuote>>
}): Promise<{
  receiveRes: YcReceiveSubmitResult
  pricing: ReturnType<typeof computeYcFundBalancePricing>
  sequenceId: string
  submittedLocalAmount: number
}> {
  let localAmount = resolveYcFundBalanceSubmitLocalPayIn({
    pricing: input.prepared.provisional,
    customerSellRate: input.prepared.customerRate,
  })
  let sequenceId = `yc_fb_${randomUUID()}`

  for (let attempt = 0; attempt < YC_FUND_BALANCE_RECEIVE_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      sequenceId = `yc_fb_${randomUUID()}`
    }

    logYcTiming("fund_balance_receive_attempt", {
      attempt: attempt + 1,
      maxAttempts: YC_FUND_BALANCE_RECEIVE_MAX_ATTEMPTS,
      localAmount,
      currency: input.ctx.currency,
      country: input.ctx.country,
      rail: input.ctx.rail,
    })

    let receiveRes: YcReceiveSubmitResult
    try {
      receiveRes = await submitYcReceive({
        sequenceId,
        customerUID: input.ctx.kycUserId,
        channelType: toYcChannelType(input.ctx.rail),
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
      submittedLocalAmount: localAmount,
    })

    const cryptoAmount = Number(receiveRes.settlementInfo?.cryptoAmount ?? 0)
    const omnibusCheck = checkYcFundBalanceOmnibusSufficient({
      cryptoAmount,
      usdCredit: pricing.usdCredit,
      processingFee: pricing.processingFee,
      tolerance: YC_FUND_BALANCE_OMNIBUS_TOLERANCE_USDC,
    })

    if (omnibusCheck.ok) {
      return { receiveRes, pricing, sequenceId, submittedLocalAmount: localAmount }
    }

    if (attempt < YC_FUND_BALANCE_RECEIVE_MAX_ATTEMPTS - 1) {
      const ycLockedPayIn = resolveYcLockedLocalPayInFromReceive({
        submittedLocalAmount: localAmount,
        receiveRes,
        economicsLocalPayIn: pricing.localPayIn,
      })
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
  country: string
  customerRate: number
  rail: FundBalanceRail
  sourcePhone?: string
  sourceNetworkId?: string
  sourceNetworkName?: string
  sequenceId?: string
  provisionalPayIn?: number
}) {
  const expiresAt = resolveYcPayInDepositExpiresAt({
    lockedAt: String(input.transfer.created_at ?? input.transfer.updated_at ?? ""),
    preferredExpiresAt: String(input.transfer.expires_at ?? ""),
    country: input.country,
    payInRail: input.rail,
  })
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
    provisionalPayIn: input.provisionalPayIn,
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

/** Indicative pricing only – no YC API calls, no DB rows. */
export async function previewFundBalanceQuote(ctx: FundBalanceQuoteInput) {
  const prepared = await prepareFundBalanceQuote(ctx)
  const expiresAt = resolveYcQuoteExpiresAt()

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
  const startedAt = Date.now()
  try {
    return await confirmFundBalanceOrderInner(ctx)
  } finally {
    logYcTiming("fund_balance_confirm", {
      durationMs: Date.now() - startedAt,
      currency: ctx.currency,
      country: ctx.country,
      rail: ctx.rail,
      userId: ctx.kycUserId,
    })
  }
}

async function confirmFundBalanceOrderInner(ctx: FundBalanceQuoteInput) {
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
    const quotedReceive = Number(existing.quoted_receive ?? meta.usd_credit ?? 0)
    const quotedPayIn = Number(existing.quoted_pay_in ?? 0)
    const ycLegFeesUsd = Number(meta.yc_leg_fees_usd ?? meta.yc_channel_fee_usd ?? 0)
    const settlement = (existing.settlement_info as Record<string, unknown> | null) ?? null
    const cryptoAmount = Number(settlement?.cryptoAmount ?? meta.omnibus_in_expected ?? 0)
    const receiveLeg = {
      cryptoAmountUsd: cryptoAmount > 0 ? cryptoAmount : 0,
      networkFeeAmountUsd: ycLegFeesUsd > 0 ? ycLegFeesUsd : 0,
      serviceFeeAmountUsd: 0,
    }
    // Keep locked credit/fees from the original confirm – do not re-solve credit from
    // padded localPayIn (that inflated usdCredit, e.g. $3 → $3.09 on idempotent reuse).
    const pricingRaw =
      quotedReceive > 0
        ? computeYcFundBalancePricing({
            usdCredit: quotedReceive,
            customerSellRate: prepared.customerRate,
            ycSellRate: Number(prepared.leg.yc_buy),
            receiveLeg,
            processingFeeBps: prepared.processingFeeBps,
          })
        : computeYcFundBalancePricing({
            localPayIn: quotedPayIn,
            customerSellRate: prepared.customerRate,
            ycSellRate: Number(prepared.leg.yc_buy),
            receiveLeg,
            processingFeeBps: prepared.processingFeeBps,
          })
    const pricing = {
      ...pricingRaw,
      localPayIn: quotedPayIn > 0 ? quotedPayIn : pricingRaw.localPayIn,
      ...(ycLegFeesUsd > 0 ? { ycLegFeesUsd } : {}),
    }

    let bankInfo = (existing.bank_info as Record<string, unknown> | null) ?? null
    if (!resolveYcBankInfoName(bankInfo)) {
      try {
        const hydrated = await hydrateYcReceiveBankInfo({
          id: String(existing.leg1_yc_id ?? "").trim() || undefined,
          sequenceId: String(existing.leg1_sequence_id ?? "").trim() || undefined,
          bankInfo: bankInfo ?? undefined,
        })
        const nextBank =
          (hydrated.bankInfo as Record<string, unknown> | null | undefined) ?? null
        if (resolveYcBankInfoName(nextBank)) {
          bankInfo = nextBank
          await ctx.admin
            .from("yc_transfers")
            .update({
              bank_info: bankInfo,
              updated_at: new Date().toISOString(),
            })
            .eq("id", String(existing.id))
        }
      } catch {
        // Keep stored bankInfo when lookup fails.
      }
    }

    return formatFundBalanceTransferResponse({
      transfer: { ...existing, bank_info: bankInfo },
      transactionEasnerId,
      pricing,
      currency: ctx.currency,
      country: ctx.country,
      customerRate: Number(existing.customer_rate ?? prepared.customerRate),
      rail: ctx.rail,
      sourcePhone: ctx.sourcePhone,
      sourceNetworkId: ctx.sourceNetworkId,
      sourceNetworkName: ctx.sourceNetworkName,
      sequenceId: String(existing.leg1_sequence_id ?? ""),
      provisionalPayIn: quotedPayIn > 0 ? quotedPayIn : pricing.localPayIn,
    })
  }

  const {
    receiveRes,
    pricing,
    sequenceId: finalSequenceId,
    submittedLocalAmount,
  } = await submitFundBalanceYcReceive({
    ctx,
    prepared,
  })
  const lockedLocalPayIn = resolveYcLockedLocalPayInFromReceive({
    submittedLocalAmount,
    receiveRes,
    economicsLocalPayIn: pricing.localPayIn,
  })
  const lockedPricing = { ...pricing, localPayIn: lockedLocalPayIn }
  const omnibusInExpected = Number(
    receiveRes.settlementInfo?.cryptoAmount ?? lockedPricing.omnibusInUsd,
  )

  const startedAt = new Date().toISOString()
  const expiresAt = resolveYcPayInDepositExpiresAt({
    lockedAt: startedAt,
    preferredExpiresAt:
      (receiveRes as { expiresAt?: string }).expiresAt ??
      (receiveRes as { expires_at?: string }).expires_at,
    country: ctx.country,
    payInRail: ctx.rail,
  })
  const easnerTransactionId = generateTransactionId()
  const residenceCountry = String(ctx.userRow?.residence_country ?? ctx.country).trim().toUpperCase()
  const displayFeesLocked = buildYcFundBalanceDisplayFees({
    usdCredit: lockedPricing.usdCredit,
    processingFee: lockedPricing.processingFee,
    ycLegFeesUsd: lockedPricing.ycLegFeesUsd,
    easnerSellRate: prepared.customerRate,
    payInCurrency: ctx.currency,
  })
  const depositReview = buildYcFundBalanceDepositReviewSnapshot({
    localPayIn: lockedLocalPayIn,
    localCurrency: ctx.currency,
    usdCredit: lockedPricing.usdCredit,
    processingFee: lockedPricing.processingFee,
    exchangeFee: lockedPricing.ycLegFeesUsd,
    exchangeRate: prepared.customerRate,
    residenceCountry,
    payInRail: ctx.rail,
    displayProcessingFeeLocal: displayFeesLocked.displayProcessingFeeLocal,
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
    usdCredit: lockedPricing.usdCredit,
    processingFee: lockedPricing.processingFee,
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
      amount: lockedPricing.usdCredit,
      currency: "USD",
      direction: "in",
      easner_transaction_id: easnerTransactionId,
      occurred_at: startedAt,
      metadata: {
        ...metadata,
        easner_transaction_id: easnerTransactionId,
        quote_locked_at: startedAt,
        transaction_started_at: startedAt,
        quote_expires_at: expiresAt,
        yc_bank_info: receiveRes.bankInfo ?? null,
        yc_pay_in_notice: ycPayInInstructionNotice(ctx.rail),
        local_pay_in: lockedLocalPayIn,
        pay_in_rail: ctx.rail,
        display_processing_fee: displayFeesLocked.displayProcessingFee,
        display_processing_fee_local: displayFeesLocked.displayProcessingFeeLocal,
        yc_leg_fees_usd: lockedPricing.ycLegFeesUsd,
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
      quoted_receive: lockedPricing.usdCredit,
      customer_rate: prepared.customerRate,
      leg1_sequence_id: finalSequenceId,
      leg1_yc_id: receiveRes.id ?? null,
      leg1_channel_id: readYcResponseChannelId(receiveRes) ?? prepared.channelId,
      bank_info: receiveRes.bankInfo ?? null,
      settlement_info: receiveRes.settlementInfo ?? null,
      metadata: {
        quote_key: prepared.quoteKey,
        processing_fee: lockedPricing.processingFee,
        yc_channel_fee_usd: lockedPricing.ycLegFeesUsd,
        yc_leg_fees_usd: lockedPricing.ycLegFeesUsd,
        display_processing_fee: displayFeesLocked.displayProcessingFee,
        display_processing_fee_local: displayFeesLocked.displayProcessingFeeLocal,
        usd_credit: lockedPricing.usdCredit,
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

  if (tx?.id && transferRow?.id) {
    const { data: txRow } = await ctx.admin
      .from("transactions")
      .select("metadata")
      .eq("id", tx.id)
      .maybeSingle()
    const prior = (txRow?.metadata ?? {}) as Record<string, unknown>
    await ctx.admin
      .from("transactions")
      .update({
        metadata: {
          ...prior,
          yc_transfer_id: String(transferRow.id),
        },
      })
      .eq("id", tx.id)
  }

  return formatFundBalanceTransferResponse({
    transfer: (transferRow ?? {}) as Record<string, unknown>,
    transactionEasnerId: easnerTransactionId,
    pricing: lockedPricing,
    currency: ctx.currency,
    country: ctx.country,
    customerRate: prepared.customerRate,
    rail: ctx.rail,
    sourcePhone: ctx.sourcePhone,
    sourceNetworkId: ctx.sourceNetworkId,
    sourceNetworkName: ctx.sourceNetworkName,
    sequenceId: finalSequenceId,
    provisionalPayIn: prepared.provisional.localPayIn,
  })
}

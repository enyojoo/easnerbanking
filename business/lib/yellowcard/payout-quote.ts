import { randomUUID } from "crypto"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { findYcBalancePayoutRate, listYcRates } from "@/lib/fx/yc-rates"
import {
  applyProviderBindingToRecipient,
  assertYcBalancePayoutEconomicsSufficient,
  computeYcBalancePayoutPricing,
  estimateYcSendLegSettlementCryptoForQuotedReceive,
  normalizeGlobalPayoutQuoteReceiveAmount,
  normalizePayoutReceiveAmount,
  normalizePayoutReceiveAmountForCurrency,
  validateYcRecipientForCorridor,
  YC_QUOTE_TTL_MS,
  buildLegacyNoahSettlementFromLeg,
  computePayoutQuoteDisplayProcessingFee,
  resolveYcSendLegFeesFromResponse,
  type PayoutSettlementLeg,
} from "@easner/shared"
import {
  resolveRecipientPayoutCountry,
  type RecipientSellPrepareRow,
} from "@/lib/terminal/recipient-sell-prepare"
import {
  findYcSendChannel,
  resolveYcSendSubmitChannel,
} from "@/lib/payout-providers/yellowcard-provider"
import { mapRecipientToYcSend } from "@/lib/yellowcard/map-recipient-to-yc-send"
import { submitYcSend, type YcSendSubmitResult } from "@/lib/yellowcard/send-submit"
import { submitYcSendWithDestinationAmountLock } from "@/lib/yellowcard/yc-send-leg-lock"
import { fetchYcSendServiceFeeConfig } from "@/lib/yellowcard/send-fee-config"
import { isYcAdaptiveLockEnabled } from "@/lib/yellowcard/adaptive-lock-flags"
import { YcPayoutError } from "@/lib/yellowcard/payout-errors"
import { buildYcKycPersonMetadata } from "@/lib/yellowcard/kyc-metadata"
import type { PayoutQuoteResult } from "@/lib/noah/payout-quote"
import {
  resolveYcPayoutLimits,
  validateYcBalancePayoutAmount,
} from "@easner/shared"
import { buildPayoutQuoteKey } from "@/lib/payout/payout-quote-key"
import { quoteFiatProcessingFeeBps } from "@/lib/processing-fee/quote-processing-fee-bps"
import { readYcResponseChannelId, ycSubmitChannelTypeFromChannel } from "@/lib/yellowcard/channels"

function roundUsdc(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 1_000_000) / 1_000_000
}

/**
 * Build a YC balance payout quote by locking a POST /send (forceAccept) response.
 * Uses yellowcard_rates customer rate + POST response fees.
 */
export async function buildYcPayoutQuote(input: {
  userId: string
  customerUID: string
  recipientId?: string
  recipient: RecipientSellPrepareRow
  receiveFiatAmount: number
  sourceBalanceCurrency: string
  amountEntryMode?: "send" | "receive"
  sendBudget?: number
  userTurnkeyAddress: string
  senderProfile: Parameters<typeof buildYcKycPersonMetadata>[0]["profile"]
  paymentPurpose?: string
}): Promise<PayoutQuoteResult & { yc: { sendId?: string; channelId: string; cryptoAmount: number; walletAddress?: string } }> {
  const receiveAmountRaw = normalizePayoutReceiveAmount(Number(input.receiveFiatAmount))
  if (!Number.isFinite(receiveAmountRaw) || receiveAmountRaw <= 0) {
    throw new Error("receiveFiatAmount must be positive.")
  }
  const sourceBalanceCurrency = input.sourceBalanceCurrency.trim().toUpperCase()
  if (sourceBalanceCurrency !== "USD") {
    throw new Error("Yellowcard balance payout supports USD source balance only.")
  }

  const admin = createSupabaseAdmin()
  const row = applyProviderBindingToRecipient(input.recipient, "yellowcard")

  const receiveCurrency = String(row.currency || "").trim().toUpperCase()
  const countryCode = resolveRecipientPayoutCountry(row)
  if (!countryCode) throw new Error("Recipient country is required for Yellowcard payout.")

  const rail =
    row.mobile_provider || String(row.bank_name || "").toLowerCase().includes("mobile money")
      ? ("mobile_money" as const)
      : ("bank_transfer" as const)

  /**
   * Two waves instead of one: channel + corridor gate the whole quote, so
   * they run (in parallel) first and throw their OWN errors before anything
   * else — a single 5-way Promise.all let an unrelated fee-config failure
   * mask "no send channel for this corridor" nondeterministically, and paid
   * for rate/fee provider calls on corridors that were never quotable
   * (review finding; matches the staged sibling below). `sendChannel` covers
   * the old `resolveYcSendChannelId` call, which was just
   * `findYcSendChannel().id`.
   */
  const [sendChannel, corridorRowResult] = await Promise.all([
    findYcSendChannel({
      countryCode,
      currencyCode: receiveCurrency,
      rail,
    }),
    admin
      .from("payout_corridors")
      .select("fields_schema")
      .eq("country_code", countryCode)
      .eq("currency_code", receiveCurrency)
      .eq("rail", rail)
      .maybeSingle(),
  ])

  const channelId =
    String(
      (sendChannel as { id?: unknown; channelId?: unknown } | null)?.id ??
        (sendChannel as { channelId?: unknown } | null)?.channelId ??
        "",
    ).trim() || null
  if (!channelId) {
    throw new Error("No Yellowcard send channel for this corridor.")
  }
  const ycLimits = resolveYcPayoutLimits({
    country: countryCode,
    currency: receiveCurrency,
    rail,
    channel: sendChannel as Record<string, unknown> | null,
  })

  const corridorRow = corridorRowResult.data

  const ycRecipientCheck = validateYcRecipientForCorridor({
    countryCode,
    currencyCode: receiveCurrency,
    fieldsSchema: corridorRow?.fields_schema,
    row,
  })
  if (!ycRecipientCheck.ok) {
    throw new Error(ycRecipientCheck.message)
  }

  // Corridor is quotable — now the independent rate/fee lookups in one wave.
  const [rates, ycFeeConfig, processingFeeBps] = await Promise.all([
    listYcRates(admin, { destinations: [receiveCurrency], status: "active" }),
    fetchYcSendServiceFeeConfig({
      country: countryCode,
      currency: receiveCurrency,
      channelType: ycSubmitChannelTypeFromChannel(sendChannel, rail),
      directSettlement: true,
    }),
    quoteFiatProcessingFeeBps(
      admin,
      { countryCode, currencyCode: receiveCurrency, rail },
      "pay_out",
      { userId: input.userId },
    ),
  ])

  const payoutRate = findYcBalancePayoutRate(rates, receiveCurrency)
  const customerRate = payoutRate?.rate ?? 0
  if (!customerRate || customerRate <= 0) {
    throw new Error(
      `Exchange rate for USD → ${receiveCurrency} is unavailable. Try again shortly.`,
    )
  }

  const amountEntryMode = input.amountEntryMode === "send" ? "send" : "receive"
  const sendBudget =
    input.sendBudget != null && Number.isFinite(input.sendBudget) && input.sendBudget > 0
      ? input.sendBudget
      : undefined

  const quoteReceiveAmount = normalizeGlobalPayoutQuoteReceiveAmount({
    amountEntryMode,
    receiveFiatAmount: receiveAmountRaw,
    sendBudget,
    customerRate,
    receiveCurrency,
    normalizeReceive: normalizePayoutReceiveAmountForCurrency,
  })

  const impliedSendUsd =
    amountEntryMode === "send" && sendBudget != null && sendBudget > 0
      ? roundUsdc(sendBudget)
      : roundUsdc(quoteReceiveAmount / customerRate)
  const amountCheck = validateYcBalancePayoutAmount({
    amountEntryMode,
    receiveAmount: quoteReceiveAmount,
    sendAmount: impliedSendUsd,
    customerRate,
    receiveCurrency,
    limits: ycLimits,
    rail,
  })
  if (!amountCheck.ok) {
    throw new Error(amountCheck.message)
  }

  const recipientMapped = await mapRecipientToYcSend(row, { channelId })
  if (!recipientMapped.destination.networkId) {
    throw new Error(
      "Yellowcard could not resolve a payout network for this recipient. Re-save the recipient with a bank from the corridor list.",
    )
  }
  const sender = buildYcKycPersonMetadata({
    profile: input.senderProfile,
    requireNgIds: true,
  })

  const sequenceId = `yc_preview_${randomUUID()}`
  const provisionalCryptoUsd =
    amountEntryMode === "send" && sendBudget != null && sendBudget > 0
      ? roundUsdc(sendBudget)
      : estimateYcSendLegSettlementCryptoForQuotedReceive({
          quotedReceive: quoteReceiveAmount,
          destinationRate: customerRate,
          ycSellRate: payoutRate?.yc_sell ?? undefined,
          feeConfig: ycFeeConfig,
        })
  if (!(provisionalCryptoUsd > 0)) {
    throw new Error("Could not derive USDC amount for Yellowcard payout quote.")
  }

  /**
   * Customer-facing preview totals must match lock economics (settlement crypto +
   * Easner 1%), not `computeYcBalancePayoutPricingBeforeSend`. That helper adds an
   * extra ~2% USDC pad for internal reserve; overlaying it as "Sending" (e.g. $1.53)
   * then locking (~$1.50 all-in) looks like the debit dropped on Review.
   */
  const pricing = computeYcBalancePayoutPricing({
    receiveAmount: quoteReceiveAmount,
    customerRate,
    ycFloorUsd: provisionalCryptoUsd,
    ycMidUsd:
      payoutRate?.yc_sell != null && payoutRate.yc_sell > 0
        ? roundUsdc(quoteReceiveAmount / payoutRate.yc_sell)
        : undefined,
    processingFeeBps,
  })

  const expiresAt = new Date(Date.now() + YC_QUOTE_TTL_MS).toISOString()
  const quoteId = sequenceId
  const displayProcessingFee = computePayoutQuoteDisplayProcessingFee({
    processingFee: pricing.processingFee,
    displayChannelCost: pricing.displayChannelCost,
    channelCost: pricing.channelCost,
  })

  const settlement: PayoutSettlementLeg = {
    totalFee: pricing.channelCost,
    feeCurrency: "USD",
    cryptoAuthorizedAmount: String(pricing.ycFloorUsd),
    cryptoFloor: String(pricing.ycFloorUsd),
    cryptoSendAmount: String(provisionalCryptoUsd),
    cryptoCurrency: "USDC",
    sessionId: quoteId,
    customerRate,
    ...(payoutRate?.yc_sell != null && payoutRate.yc_sell > 0
      ? { providerMid: payoutRate.yc_sell }
      : {}),
    effectiveRate: customerRate,
    marginCaptureMode: "fee_wallet_deferred",
    channelCost: pricing.channelCost,
    marginAmount: pricing.marginAmount,
    customerPrincipal: pricing.customerPrincipal,
  }

  return {
    receiveAmount: quoteReceiveAmount,
    receiveCurrency,
    customerPrincipal: pricing.customerPrincipal,
    sendAmount: pricing.customerPrincipal,
    sendCurrency: sourceBalanceCurrency,
    totalDebited: pricing.totalDebited,
    channelCost: pricing.channelCost,
    marginAmount: pricing.marginAmount,
    processingFee: pricing.processingFee,
    displayChannelCost: pricing.displayChannelCost,
    displayProcessingFee,
    ycLegFeesUsd: pricing.channelCost,
    channelId,
    settlement,
    noah: buildLegacyNoahSettlementFromLeg(settlement),
    easner: {
      quoteId,
      expiresAt,
      providerRate: customerRate,
      effectiveRate: customerRate,
      destinationAmount: quoteReceiveAmount,
      fxMarkupBps: 50,
      payinFeeAmount: 0,
      payoutFeeAmount: pricing.channelCost,
      totalFeeAmount: pricing.marginAmount + pricing.channelCost,
      sourceAmount: pricing.customerPrincipal,
      sourceCurrency: sourceBalanceCurrency,
      destinationCurrency: receiveCurrency,
      pricingTotals: {
        total_easner_fee: pricing.marginAmount,
        total_user_fee: pricing.marginAmount + pricing.channelCost,
        total_recipient_amount: quoteReceiveAmount,
      },
    },
    pricingQuoteId: quoteId,
    expiresAt,
    executionModel: "turnkey_workflow",
    provider: "yellowcard",
    quotePhase: "preview",
    requiresConfirm: true,
    quoteKey: buildPayoutQuoteKey({
      recipientId: String(input.recipientId || ""),
      sourceBalanceCurrency,
      amountEntryMode,
      receiveAmount: quoteReceiveAmount,
      sendBudget,
      paymentPurpose: input.paymentPurpose,
    }),
    yc: {
      sequenceId,
      channelId,
      cryptoAmount: pricing.ycFloorUsd,
    },
  }
}

/** Lock POST /send when user authorizes payout (not at quote). */
export async function lockYcBalancePayoutSend(input: {
  userId: string
  customerUID: string
  recipient: RecipientSellPrepareRow
  receiveFiatAmount: number
  sourceBalanceCurrency: string
  amountEntryMode?: "send" | "receive"
  sendBudget?: number
  userTurnkeyAddress: string
  senderProfile: Parameters<typeof buildYcKycPersonMetadata>[0]["profile"]
  paymentPurpose?: string
  channelId?: string
}): Promise<{
  sequenceId: string
  sendId?: string | null
  channelId: string
  cryptoAmount: number
  walletAddress: string
  pricing: ReturnType<typeof computeYcBalancePayoutPricing>
  ycLegFeesUsd: number
  lockedLocalAmount: number
  requestedLocalAmount: number
  recipientSurplusLocal: number
  payoutQuantumLocal: number
  settlementQuantumUsd: number
  precisionMode: "micro" | "cent"
  sendLegFeeLocal: number
  expiresAt?: string
  discardedSendIds: string[]
}> {
  if (!isYcAdaptiveLockEnabled("balance_payout")) {
    throw new YcPayoutError(
      "YC_SEND_UNAVAILABLE",
      "Yellowcard adaptive payout locking is temporarily disabled.",
      503,
    )
  }
  const receiveCurrency = String(input.recipient.currency || "").trim().toUpperCase()
  const countryCode = resolveRecipientPayoutCountry(input.recipient)
  if (!countryCode) throw new Error("Recipient country is required for Yellowcard payout.")

  const rail =
    input.recipient.mobile_provider ||
    String(input.recipient.bank_name || "").toLowerCase().includes("mobile money")
      ? ("mobile_money" as const)
      : ("bank_transfer" as const)

  const admin = createSupabaseAdmin()
  const submitChannelPromise = resolveYcSendSubmitChannel({
    countryCode,
    currencyCode: receiveCurrency,
    rail,
    channelId: input.channelId,
  })
  const ratesPromise = listYcRates(admin, { destinations: [receiveCurrency], status: "active" })

  const submitChannel = await submitChannelPromise
  const channelId = submitChannel?.channelId ?? ""
  const channelType = submitChannel?.channelType
  if (!channelId || !channelType) throw new Error("No Yellowcard send channel for this corridor.")

  const recipientMappedPromise = mapRecipientToYcSend(input.recipient, { channelId })
  const [rates, ycFeeConfig, recipientMapped] = await Promise.all([
    ratesPromise,
    fetchYcSendServiceFeeConfig({
      country: countryCode,
      currency: receiveCurrency,
      channelType,
      directSettlement: true,
      fresh: true,
    }),
    recipientMappedPromise,
  ])
  const payoutRate = findYcBalancePayoutRate(rates, receiveCurrency)
  const customerRate = payoutRate?.rate ?? 0
  if (!customerRate || customerRate <= 0) {
    throw new Error(`Exchange rate for USD → ${receiveCurrency} is unavailable. Try again shortly.`)
  }

  const amountEntryMode = input.amountEntryMode === "send" ? "send" : "receive"
  const sendBudget =
    input.sendBudget != null && Number.isFinite(input.sendBudget) && input.sendBudget > 0
      ? input.sendBudget
      : undefined
  const quoteReceiveAmount = normalizeGlobalPayoutQuoteReceiveAmount({
    amountEntryMode,
    receiveFiatAmount: normalizePayoutReceiveAmount(Number(input.receiveFiatAmount)),
    sendBudget,
    customerRate,
    receiveCurrency,
    normalizeReceive: normalizePayoutReceiveAmountForCurrency,
  })
  const provisionalCryptoUsd =
    amountEntryMode === "send" && sendBudget != null && sendBudget > 0
      ? roundUsdc(sendBudget)
      : estimateYcSendLegSettlementCryptoForQuotedReceive({
          quotedReceive: quoteReceiveAmount,
          destinationRate: customerRate,
          ycSellRate: payoutRate?.yc_sell ?? undefined,
          feeConfig: ycFeeConfig,
        })

  const sender = buildYcKycPersonMetadata({
    profile: input.senderProfile,
    requireNgIds: true,
  })
  const sequenceId = `yc_quote_${randomUUID()}`
  const processingFeeBpsPromise = quoteFiatProcessingFeeBps(
    admin,
    { countryCode, currencyCode: receiveCurrency, rail },
    "pay_out",
    { userId: input.userId },
  )
  const sendLock = await submitYcSendWithDestinationAmountLock({
    receiveAmount: quoteReceiveAmount,
    initialSettlementCryptoUsd: provisionalCryptoUsd,
    destinationRate: customerRate,
    ycSellRate: payoutRate?.yc_sell ?? undefined,
    receiveCurrency,
    sequenceIdPrefix: "yc_quote",
    feeConfig: ycFeeConfig,
    singleSafeSurplusLock: true,
    buildSubmit: async ({ settlementCryptoUsd, sequenceId: lockSequenceId }) =>
      submitYcSend({
        sequenceId: lockSequenceId,
        customerUID: input.customerUID,
        customerType: "retail",
        channelType,
        channelId,
        currency: receiveCurrency,
        country: countryCode,
        settlementCryptoAmount: settlementCryptoUsd,
        refundMode: "balance_payout",
        userTurnkeyAddress: input.userTurnkeyAddress,
        sender,
        destination: recipientMapped.destination,
        sendExtras: recipientMapped.root,
        reason: input.paymentPurpose,
      }),
  })
  const sendRes: YcSendSubmitResult = sendLock.sendRes
  const lockedSequenceId = sendLock.sequenceId
  const lockedLocalAmount = sendLock.recipientLocalAmount

  const cryptoAmount = Number(sendRes.settlementInfo?.cryptoAmount ?? sendRes.convertedAmount ?? 0)
  if (!Number.isFinite(cryptoAmount) || cryptoAmount <= 0) {
    throw new Error("Yellowcard send response missing cryptoAmount.")
  }
  const walletAddress = String(sendRes.settlementInfo?.walletAddress ?? "").trim()
  if (!walletAddress) throw new Error("Yellowcard send response missing walletAddress.")

  const networkFeeAmountUsd = Number(sendRes.networkFeeAmountUSD ?? 0)
  const serviceFeeAmountUsd = Number(sendRes.serviceFeeAmountUSD ?? 0)
  const sendLegFees = resolveYcSendLegFeesFromResponse({
    sendRes: sendRes as Record<string, unknown>,
    destinationRate: customerRate,
    ycRate: Number(sendRes.rate ?? 0) || undefined,
  })
  const ycLegFeesUsd = sendLegFees.totalFeeUsd
  const processingFeeBps = await processingFeeBpsPromise
  const pricing = computeYcBalancePayoutPricing({
    receiveAmount: lockedLocalAmount,
    customerRate,
    ycFloorUsd: cryptoAmount,
    ycMidUsd:
      payoutRate?.yc_sell != null && payoutRate.yc_sell > 0
        ? roundUsdc(lockedLocalAmount / payoutRate.yc_sell)
        : undefined,
    networkFeeAmountUsd: sendLegFees.networkFeeAmountUsd || networkFeeAmountUsd,
    serviceFeeAmountUsd: sendLegFees.serviceFeeAmountUsd || serviceFeeAmountUsd,
    processingFeeBps,
  })

  assertYcBalancePayoutEconomicsSufficient({
    totalDebited: pricing.totalDebited,
    cryptoAmount,
    marginAmount: pricing.marginAmount,
    processingFee: pricing.processingFee,
  })

  return {
    sequenceId: lockedSequenceId,
    sendId: sendRes.id,
    channelId: readYcResponseChannelId(sendRes) ?? channelId,
    cryptoAmount,
    walletAddress,
    pricing,
    ycLegFeesUsd,
    lockedLocalAmount,
    requestedLocalAmount: sendLock.requestedLocalAmount,
    recipientSurplusLocal: sendLock.recipientSurplusLocal,
    payoutQuantumLocal: sendLock.payoutQuantumLocal,
    settlementQuantumUsd: sendLock.settlementQuantumUsd,
    precisionMode: sendLock.precisionMode,
    sendLegFeeLocal: sendLock.sendLegFeeLocal,
    expiresAt: sendLock.expiresAt,
    discardedSendIds: sendLock.discardedSendIds,
  }
}

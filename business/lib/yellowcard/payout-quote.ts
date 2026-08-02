import { randomUUID } from "crypto"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { findYcBalancePayoutRate, listYcRates } from "@/lib/fx/yc-rates"
import {
  applyProviderBindingToRecipient,
  assertYcBalancePayoutEconomicsSufficient,
  checkYcBalancePayoutEconomicsSufficient,
  computeYcBalancePayoutPricing,
  computeYcBalancePayoutPricingBeforeSend,
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
import { resolveYcSendChannelId, findYcSendChannel } from "@/lib/payout-providers/yellowcard-provider"
import { mapRecipientToYcSend } from "@/lib/yellowcard/map-recipient-to-yc-send"
import {
  denyYcSend,
  hydrateYcSendSubmitResult,
  submitYcSend,
  type YcSendSubmitResult,
} from "@/lib/yellowcard/send-submit"
import { submitYcSendWithDestinationAmountLock } from "@/lib/yellowcard/yc-send-leg-lock"
import { fetchYcSendServiceFeeConfig } from "@/lib/yellowcard/send-fee-config"
import {
  assertYcExactLocalCredit,
  planYcExactLocalPayout,
} from "@/lib/yellowcard/exact-local-payout"
import { buildYcKycPersonMetadata } from "@/lib/yellowcard/kyc-metadata"
import type { PayoutQuoteResult } from "@/lib/noah/payout-quote"
import {
  resolveYcPayoutLimits,
  validateYcBalancePayoutAmount,
} from "@easner/shared"
import { buildPayoutQuoteKey } from "@/lib/payout/payout-quote-key"
import { quoteFiatProcessingFeeBps } from "@/lib/processing-fee/quote-processing-fee-bps"

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

  const channelId = await resolveYcSendChannelId({
    countryCode,
    currencyCode: receiveCurrency,
    rail,
  })
  if (!channelId) {
    throw new Error("No Yellowcard send channel for this corridor.")
  }
  const sendChannel = await findYcSendChannel({
    countryCode,
    currencyCode: receiveCurrency,
    rail,
  })
  const ycLimits = resolveYcPayoutLimits({
    country: countryCode,
    currency: receiveCurrency,
    rail,
    channel: sendChannel as Record<string, unknown> | null,
  })

  const { data: corridorRow } = await admin
    .from("payout_corridors")
    .select("fields_schema")
    .eq("country_code", countryCode)
    .eq("currency_code", receiveCurrency)
    .eq("rail", rail)
    .maybeSingle()

  const ycRecipientCheck = validateYcRecipientForCorridor({
    countryCode,
    currencyCode: receiveCurrency,
    fieldsSchema: corridorRow?.fields_schema,
    row,
  })
  if (!ycRecipientCheck.ok) {
    throw new Error(ycRecipientCheck.message)
  }

  const rates = await listYcRates(admin, { destinations: [receiveCurrency], status: "active" })
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
  const ycFeeConfig = await fetchYcSendServiceFeeConfig({
    country: countryCode,
    currency: receiveCurrency,
    channelType: rail === "mobile_money" ? "momo" : "bank",
    directSettlement: true,
  })
  const provisionalCryptoUsd =
    amountEntryMode === "send" && sendBudget != null && sendBudget > 0
      ? roundUsdc(sendBudget)
      : estimateYcSendLegSettlementCryptoForQuotedReceive({
          quotedReceive: quoteReceiveAmount,
          destinationRate: customerRate,
          ycSellRate: payoutRate?.yc_sell,
          feeConfig: ycFeeConfig,
        })
  if (!(provisionalCryptoUsd > 0)) {
    throw new Error("Could not derive USDC amount for Yellowcard payout quote.")
  }

  const processingFeeBps = await quoteFiatProcessingFeeBps(
    admin,
    { countryCode, currencyCode: receiveCurrency, rail },
    "pay_out",
    { userId: input.userId },
  )
  // Preview must price the path /confirm will actually take, or the review screen shows a fee the
  // customer is not charged. Exact-local costs the balance-settlement fee, not the 1% crypto fee.
  const previewExactPlan = await planYcExactLocalPayout({
    receiveAmount: quoteReceiveAmount,
    ycSellRate: payoutRate?.yc_sell,
    country: countryCode,
    currency: receiveCurrency,
    channelType: rail === "mobile_money" ? "momo" : "bank",
  })
  const ycMidUsd =
    payoutRate?.yc_sell != null && payoutRate.yc_sell > 0
      ? roundUsdc(quoteReceiveAmount / payoutRate.yc_sell)
      : undefined
  const pricing = previewExactPlan.eligible
    ? computeYcBalancePayoutPricing({
        receiveAmount: quoteReceiveAmount,
        customerRate,
        ycFloorUsd: previewExactPlan.costUsd,
        ycMidUsd,
        processingFeeBps,
      })
    : computeYcBalancePayoutPricingBeforeSend({
        receiveAmount: quoteReceiveAmount,
        customerRate,
        provisionalCryptoUsd,
        ycMidUsd,
        ycBuyRate:
          payoutRate?.yc_sell != null && payoutRate.yc_sell > 0 ? payoutRate.yc_sell : undefined,
        processingFeeBps,
      })
  const previewCryptoUsd = previewExactPlan.eligible
    ? previewExactPlan.costUsd
    : provisionalCryptoUsd

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
    cryptoSendAmount: String(previewCryptoUsd),
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
    ycLegFeesUsd: pricing.ycLegFeesUsd ?? 0,
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

export type YcPayoutSettlementMode = "direct_crypto" | "balance_exact"

type YcBalancePayoutLockResult = {
  sequenceId: string
  sendId?: string | null
  channelId: string
  cryptoAmount: number
  walletAddress: string
  pricing: ReturnType<typeof computeYcBalancePayoutPricing>
  ycLegFeesUsd: number
  lockedLocalAmount: number
  /**
   * `direct_crypto` funds this send with a per-send USDC deposit and quantises the recipient's
   * credit to USD cents. `balance_exact` credits the exact local amount from the YC balance and
   * needs POST /send/{id}/accept after the USDC sweep replenishes the float.
   */
  settlementMode: YcPayoutSettlementMode
}

/**
 * Lock a balance-settled send that credits the recipient exactly the quoted amount.
 *
 * The YC balance funds the payout immediately, so `walletAddress` is the Treasury Portal
 * top-up address: the user's USDC sweep replenishes the float instead of funding this send.
 */
async function tryLockYcExactLocalPayoutSend(args: {
  admin: ReturnType<typeof createSupabaseAdmin>
  input: {
    userId: string
    customerUID: string
    paymentPurpose?: string
  }
  plan: Awaited<ReturnType<typeof planYcExactLocalPayout>>
  quoteReceiveAmount: number
  receiveCurrency: string
  countryCode: string
  rail: "bank_transfer" | "mobile_money"
  channelId: string
  customerRate: number
  ycSellRate: number
  sender: Record<string, unknown>
  recipientMapped: Awaited<ReturnType<typeof mapRecipientToYcSend>>
}): Promise<YcBalancePayoutLockResult | null> {
  // Priced before the send exists, so invalid economics cannot leave an orphan lock at YC.
  const processingFeeBps = await quoteFiatProcessingFeeBps(
    args.admin,
    { countryCode: args.countryCode, currencyCode: args.receiveCurrency, rail: args.rail },
    "pay_out",
    { userId: args.input.userId },
  )
  const pricing = computeYcBalancePayoutPricing({
    receiveAmount: args.quoteReceiveAmount,
    customerRate: args.customerRate,
    ycFloorUsd: args.plan.costUsd,
    ycMidUsd: args.ycSellRate > 0 ? roundUsdc(args.quoteReceiveAmount / args.ycSellRate) : undefined,
    processingFeeBps,
  })
  const economics = checkYcBalancePayoutEconomicsSufficient({
    totalDebited: pricing.totalDebited,
    cryptoAmount: args.plan.costUsd,
    marginAmount: pricing.marginAmount,
    processingFee: pricing.processingFee,
  })
  if (!economics.ok) {
    console.warn("[yc-exact-local] economics insufficient, using direct settlement", economics)
    return null
  }

  const sequenceId = `yc_quote_${randomUUID()}`
  let sendId = ""
  let lockedLocalAmount = 0
  try {
    const sendRes = await submitYcSend({
      sequenceId,
      customerUID: args.input.customerUID,
      customerType: "retail",
      channelId: args.channelId,
      currency: args.receiveCurrency,
      country: args.countryCode,
      directSettlement: false,
      localAmount: args.quoteReceiveAmount,
      // Locks the rate without paying the recipient — accepted after the USDC sweep lands.
      forceAccept: false,
      refundMode: "balance_payout",
      sender: args.sender,
      destination: args.recipientMapped.destination,
      sendExtras: args.recipientMapped.root,
      reason: args.input.paymentPurpose,
    })
    sendId = String(sendRes.id ?? "").trim()
    // POST occasionally omits the credited amount; read it back rather than assume a mismatch.
    const credited =
      sendRes.convertedAmount == null && sendRes.localAmount == null
        ? await hydrateYcSendSubmitResult(sendRes)
        : sendRes
    lockedLocalAmount = assertYcExactLocalCredit({
      quotedReceive: args.quoteReceiveAmount,
      sendRes: credited as Record<string, unknown>,
      receiveCurrency: args.receiveCurrency,
    })
    if (!sendId) throw new Error("yellowcard_send_id_missing")
  } catch (e) {
    // Never fail the payout over this: the send is unaccepted, so nothing has been paid and the
    // caller falls back to direct settlement.
    console.warn("[yc-exact-local] falling back to direct settlement", {
      sequenceId,
      sendId: sendId || null,
      error: e instanceof Error ? e.message : String(e),
    })
    if (sendId) await denyYcSend(sendId).catch(() => {})
    return null
  }

  return {
    sequenceId,
    sendId,
    channelId: args.channelId,
    // The sweep tops up the YC balance rather than funding this send directly.
    cryptoAmount: args.plan.costUsd,
    walletAddress: args.plan.topupAddress,
    pricing,
    ycLegFeesUsd: roundUsdc(args.plan.feeLocal / args.ycSellRate),
    lockedLocalAmount,
    settlementMode: "balance_exact",
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
}): Promise<YcBalancePayoutLockResult> {
  const receiveCurrency = String(input.recipient.currency || "").trim().toUpperCase()
  const countryCode = resolveRecipientPayoutCountry(input.recipient)
  if (!countryCode) throw new Error("Recipient country is required for Yellowcard payout.")

  const rail =
    input.recipient.mobile_provider ||
    String(input.recipient.bank_name || "").toLowerCase().includes("mobile money")
      ? ("mobile_money" as const)
      : ("bank_transfer" as const)

  const channelId =
    String(input.channelId || "").trim() ||
    (await resolveYcSendChannelId({
      countryCode,
      currencyCode: receiveCurrency,
      rail,
    })) ||
    ""
  if (!channelId) throw new Error("No Yellowcard send channel for this corridor.")

  const admin = createSupabaseAdmin()
  const rates = await listYcRates(admin, { destinations: [receiveCurrency], status: "active" })
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
  const ycFeeConfig = await fetchYcSendServiceFeeConfig({
    country: countryCode,
    currency: receiveCurrency,
    channelType: rail === "mobile_money" ? "momo" : "bank",
    directSettlement: true,
  })
  const provisionalCryptoUsd =
    amountEntryMode === "send" && sendBudget != null && sendBudget > 0
      ? roundUsdc(sendBudget)
      : estimateYcSendLegSettlementCryptoForQuotedReceive({
          quotedReceive: quoteReceiveAmount,
          destinationRate: customerRate,
          ycSellRate: payoutRate?.yc_sell,
          feeConfig: ycFeeConfig,
        })

  const recipientMapped = await mapRecipientToYcSend(input.recipient, { channelId })
  const sender = buildYcKycPersonMetadata({
    profile: input.senderProfile,
    requireNgIds: true,
  })
  const sequenceId = `yc_quote_${randomUUID()}`

  const exactPlan = await planYcExactLocalPayout({
    receiveAmount: quoteReceiveAmount,
    ycSellRate: payoutRate?.yc_sell,
    country: countryCode,
    currency: receiveCurrency,
    channelType: rail === "mobile_money" ? "momo" : "bank",
  })
  if (exactPlan.eligible) {
    const exactLock = await tryLockYcExactLocalPayoutSend({
      admin,
      input,
      plan: exactPlan,
      quoteReceiveAmount,
      receiveCurrency,
      countryCode,
      rail,
      channelId,
      customerRate,
      ycSellRate: Number(payoutRate?.yc_sell ?? 0),
      sender,
      recipientMapped,
    })
    if (exactLock) return exactLock
  }

  const sendLock = await submitYcSendWithDestinationAmountLock({
    receiveAmount: quoteReceiveAmount,
    initialSettlementCryptoUsd: provisionalCryptoUsd,
    destinationRate: customerRate,
    ycSellRate: payoutRate?.yc_sell,
    receiveCurrency,
    sequenceIdPrefix: "yc_quote",
    feeConfig: ycFeeConfig,
    buildSubmit: async ({ settlementCryptoUsd, sequenceId: lockSequenceId }) =>
      submitYcSend({
        sequenceId: lockSequenceId,
        customerUID: input.customerUID,
        customerType: "retail",
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
  const lockedLocalAmount = sendLock.lockedLocalAmount

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
  const processingFeeBps = await quoteFiatProcessingFeeBps(
    admin,
    { countryCode, currencyCode: receiveCurrency, rail },
    "pay_out",
    { userId: input.userId },
  )
  const pricing = computeYcBalancePayoutPricing({
    receiveAmount: quoteReceiveAmount,
    customerRate,
    ycFloorUsd: cryptoAmount,
    ycMidUsd:
      payoutRate?.yc_sell != null && payoutRate.yc_sell > 0
        ? roundUsdc(quoteReceiveAmount / payoutRate.yc_sell)
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
    channelId,
    cryptoAmount,
    walletAddress,
    pricing,
    ycLegFeesUsd,
    lockedLocalAmount,
    settlementMode: "direct_crypto",
  }
}

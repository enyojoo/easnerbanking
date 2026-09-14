import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  buildLegacyNoahSettlementFromLeg,
  computePayoutQuoteDisplayProcessingFee,
  computeYcBalancePayoutPricing,
  normalizeGlobalPayoutQuoteReceiveAmount,
  normalizePayoutReceiveAmount,
  normalizePayoutReceiveAmountForCurrency,
  resolveGridPayoutLimits,
  settlementAssetForPayoutProvider,
  validateBalancePayoutAmountForProvider,
  type PayoutSettlementLeg,
} from "@easner/shared"
import { findGridBalancePayoutRate, listGridRates } from "@/lib/fx/grid-rates"
import { findNoahRate, listNoahRates } from "@/lib/fx/noah-rates"
import type { PayoutQuoteResult } from "@/lib/noah/payout-quote"
import {
  resolveRecipientPayoutCountry,
  type RecipientSellPrepareRow,
} from "@/lib/terminal/recipient-sell-prepare"
import { buildPayoutQuoteKey } from "@/lib/payout/payout-quote-key"
import { quoteFiatProcessingFeeBps } from "@/lib/processing-fee/quote-processing-fee-bps"
import { getBridgeQuoteTtlMs } from "./config"

function roundUsdc(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 1_000_000) / 1_000_000
}

function expectedSourceBalance(receiveCurrency: string): "USD" | "EUR" {
  return receiveCurrency.trim().toUpperCase() === "EUR" ? "EUR" : "USD"
}

async function resolveBridgeCustomerRate(
  admin: ReturnType<typeof createSupabaseAdmin>,
  source: string,
  receive: string,
): Promise<number> {
  if (source === receive) return 1
  try {
    const gridRates = await listGridRates(admin, { destinations: [receive], status: "active" })
    const grid = findGridBalancePayoutRate(gridRates, receive)
    if (grid?.rate && grid.rate > 0) return grid.rate
  } catch {
    /* fall through */
  }
  const noahRates = await listNoahRates(admin, { destinations: [receive], status: "active" })
  const noah = findNoahRate(noahRates, source, receive)
  if (noah?.rate && noah.rate > 0) return noah.rate
  throw new Error(`Exchange rate for ${source} → ${receive} is unavailable. Try again shortly.`)
}

export async function buildBridgeBalancePayoutPreview(input: {
  admin?: ReturnType<typeof createSupabaseAdmin>
  userId?: string
  businessId?: string | null
  recipient: RecipientSellPrepareRow
  recipientId: string
  receiveFiatAmount: number
  sourceBalanceCurrency: string
  amountEntryMode?: "send" | "receive"
  sendBudget?: number
  paymentPurpose?: string
}): Promise<PayoutQuoteResult> {
  const admin = input.admin ?? createSupabaseAdmin()
  const receiveCurrency = String(input.recipient.currency || "").trim().toUpperCase()
  const expected = expectedSourceBalance(receiveCurrency)
  const sourceBalanceCurrency = input.sourceBalanceCurrency.trim().toUpperCase()
  if (sourceBalanceCurrency !== expected) {
    throw new Error(`This payout uses your ${expected} balance.`)
  }
  const countryCode = resolveRecipientPayoutCountry(input.recipient)
  if (!countryCode) throw new Error("Recipient country is required.")

  const customerRate = await resolveBridgeCustomerRate(admin, sourceBalanceCurrency, receiveCurrency)
  const amountEntryMode = input.amountEntryMode === "send" ? "send" : "receive"
  const sendBudget =
    input.sendBudget != null && Number.isFinite(input.sendBudget) && input.sendBudget > 0
      ? input.sendBudget
      : undefined
  const receiveAmountRaw = normalizePayoutReceiveAmount(Number(input.receiveFiatAmount))
  const quoteReceiveAmount = normalizeGlobalPayoutQuoteReceiveAmount({
    amountEntryMode,
    receiveFiatAmount: receiveAmountRaw,
    sendBudget,
    customerRate,
    receiveCurrency,
    normalizeReceive: normalizePayoutReceiveAmountForCurrency,
  })

  const rail =
    input.recipient.mobile_provider ||
    String(input.recipient.bank_name || "").toLowerCase().includes("mobile money")
      ? ("mobile_money" as const)
      : ("bank_transfer" as const)
  const limits = resolveGridPayoutLimits({
    country: countryCode,
    currency: receiveCurrency,
    rail,
  })
  const limitCheck = validateBalancePayoutAmountForProvider({
    provider: "bridge",
    sourceBalanceCurrency,
    amountEntryMode,
    receiveAmount: quoteReceiveAmount,
    sendAmount: sendBudget,
    customerRate,
    sendCurrency: sourceBalanceCurrency,
    receiveCurrency,
    rail,
    ycLimits: limits,
  })
  if (!limitCheck.ok) throw new Error(limitCheck.message)

  const processingFeeBps = await quoteFiatProcessingFeeBps(
    admin,
    { countryCode, currencyCode: receiveCurrency, rail },
    "pay_out",
    input.userId != null ? { userId: input.userId, businessId: input.businessId ?? null } : undefined,
  )
  const provisionalCrypto = roundUsdc(quoteReceiveAmount / customerRate)
  const pricing = computeYcBalancePayoutPricing({
    receiveAmount: quoteReceiveAmount,
    customerRate,
    ycFloorUsd: provisionalCrypto,
    processingFeeBps,
  })
  const quoteKey = buildPayoutQuoteKey({
    recipientId: input.recipientId,
    sourceBalanceCurrency,
    amountEntryMode,
    receiveAmount: quoteReceiveAmount,
    sendBudget,
    paymentPurpose: input.paymentPurpose,
  })
  const sequenceId = `bridge_preview_${quoteKey.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 80)}`
  const expiresAt = new Date(Date.now() + getBridgeQuoteTtlMs()).toISOString()
  const settlementAsset = settlementAssetForPayoutProvider("bridge", receiveCurrency)
  const displayProcessingFee = computePayoutQuoteDisplayProcessingFee({
    processingFee: pricing.processingFee,
    displayChannelCost: pricing.channelCost,
    channelCost: pricing.channelCost,
  })
  const settlement: PayoutSettlementLeg = {
    totalFee: pricing.channelCost,
    feeCurrency: sourceBalanceCurrency,
    cryptoAuthorizedAmount: String(provisionalCrypto),
    cryptoFloor: String(provisionalCrypto),
    cryptoSendAmount: String(provisionalCrypto),
    cryptoCurrency: settlementAsset,
    sessionId: sequenceId,
    customerRate,
    effectiveRate: customerRate,
    marginCaptureMode: "fee_wallet_deferred",
    channelCost: pricing.channelCost,
    marginAmount: pricing.marginAmount,
    customerPrincipal: pricing.customerPrincipal,
  }
  const userFee = roundUsdc(pricing.marginAmount + pricing.processingFee + pricing.channelCost)

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
    displayChannelCost: pricing.channelCost,
    displayProcessingFee,
    settlement,
    noah: buildLegacyNoahSettlementFromLeg(settlement) as PayoutQuoteResult["noah"],
    easner: {
      quoteId: sequenceId,
      expiresAt,
      providerRate: customerRate,
      effectiveRate: customerRate,
      destinationAmount: quoteReceiveAmount,
      fxMarkupBps: 0,
      payinFeeAmount: 0,
      payoutFeeAmount: roundUsdc(pricing.processingFee + pricing.channelCost),
      totalFeeAmount: userFee,
      sourceAmount: pricing.customerPrincipal,
      sourceCurrency: sourceBalanceCurrency,
      destinationCurrency: receiveCurrency,
      pricingTotals: {
        total_easner_fee: pricing.marginAmount,
        total_user_fee: userFee,
        total_recipient_amount: quoteReceiveAmount,
      },
    },
    pricingQuoteId: sequenceId,
    expiresAt,
    executionModel: "turnkey_workflow",
    provider: "bridge",
    quotePhase: "preview",
    requiresConfirm: true,
    quoteKey,
  }
}

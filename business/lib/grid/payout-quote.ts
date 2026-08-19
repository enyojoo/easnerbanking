import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  computeYcBalancePayoutPricingBeforeSend,
  computePayoutQuoteDisplayProcessingFee,
  normalizeGlobalPayoutQuoteReceiveAmount,
  normalizePayoutReceiveAmount,
  normalizePayoutReceiveAmountForCurrency,
  buildLegacyNoahSettlementFromLeg,
  resolveGridPayoutLimits,
  validateBalancePayoutAmountForProvider,
  type PayoutSettlementLeg,
} from "@easner/shared"
import {
  findGridBalancePayoutRate,
  listGridRates,
  resolveGridLockedPayoutCustomerRate,
} from "@/lib/fx/grid-rates"
import type { PayoutQuoteResult } from "@/lib/noah/payout-quote"
import {
  resolveRecipientPayoutCountry,
  type RecipientSellPrepareRow,
} from "@/lib/terminal/recipient-sell-prepare"
import { ensureGridCustomer, type GridPersonProfile } from "./ensure-grid-customer"
import { createGridExternalAccount, gridMinorUnits } from "./external-account"
import { loadGridRecipientBankCandidates } from "./grid-bank-candidates"
import { buildGridIdempotencyKey } from "./idempotency"
import {
  buildGridBalancePayoutQuoteBody,
  gridQuoteFeesUsd,
  gridQuoteSendingAmountMajor,
} from "./quote-request"
import { gridFetch } from "./http"
import { hydrateGridQuotePaymentInstructions, resolveGridQuoteFundingAddress } from "./quote-funding"
import { buildPayoutQuoteKey } from "@/lib/payout/payout-quote-key"
import { quoteFiatProcessingFeeBps } from "@/lib/processing-fee/quote-processing-fee-bps"
import { getGridQuoteTtlMs } from "./config"
import type { GridQuote } from "./types"

function roundUsd(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

export type LockGridBalancePayoutQuoteInput = {
  admin?: ReturnType<typeof createSupabaseAdmin>
  userId: string
  businessId?: string | null
  recipient: RecipientSellPrepareRow
  receiveFiatAmount: number
  sourceBalanceCurrency: string
  amountEntryMode?: "send" | "receive"
  sendBudget?: number
  senderProfile: GridPersonProfile
  paymentPurpose?: string
}

export type LockGridBalancePayoutQuoteResult = {
  quoteId: string
  transactionId?: string
  externalAccountId: string
  customerId: string
  sequenceId: string
  receiveAmount: number
  receiveCurrency: string
  cryptoAmount: number
  fundingAddress?: string | null
  exchangeRate: number
  expiresAt: string
  pricing: {
    customerPrincipal: number
    totalDebited: number
    marginAmount: number
    processingFee: number
    channelCost: number
    customerRate: number
  }
  quote: GridQuote
}

/**
 * DB-only Grid payout preview (no Grid API). Lock happens on `/confirm`.
 */
export async function buildGridBalancePayoutPreview(input: {
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
  const sourceBalanceCurrency = input.sourceBalanceCurrency.trim().toUpperCase()
  if (sourceBalanceCurrency !== "USD") {
    throw new Error("Grid balance payout supports USD source balance only.")
  }

  const receiveCurrency = String(input.recipient.currency || "").trim().toUpperCase()
  const countryCode = resolveRecipientPayoutCountry(input.recipient)
  if (!countryCode) throw new Error("Recipient country is required for Grid payout.")

  const rail =
    input.recipient.mobile_provider ||
    String(input.recipient.bank_name || "").toLowerCase().includes("mobile money")
      ? ("mobile_money" as const)
      : ("bank_transfer" as const)

  const rates = await listGridRates(admin, { destinations: [receiveCurrency], status: "active" })
  const payoutRate = findGridBalancePayoutRate(rates, receiveCurrency)
  const customerRate = payoutRate?.rate ?? 0
  const gridMidLocalPerUsd = payoutRate?.grid_mid ?? 0
  if (!customerRate || customerRate <= 0) {
    throw new Error(`Exchange rate for USD → ${receiveCurrency} is unavailable. Try again shortly.`)
  }

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

  const gridLimits = resolveGridPayoutLimits({
    country: countryCode,
    currency: receiveCurrency,
    rail,
  })
  const limitCheck = validateBalancePayoutAmountForProvider({
    provider: "grid",
    sourceBalanceCurrency,
    amountEntryMode,
    receiveAmount: quoteReceiveAmount,
    sendAmount: sendBudget,
    customerRate,
    sendCurrency: sourceBalanceCurrency,
    receiveCurrency,
    rail,
    ycLimits: gridLimits,
  })
  if (!limitCheck.ok) {
    throw new Error(limitCheck.message)
  }

  const provisionalCrypto = roundUsd(quoteReceiveAmount / customerRate)
  const feeSubject =
    input.userId != null
      ? { userId: input.userId, businessId: input.businessId ?? null }
      : undefined
  const processingFeeBps = await quoteFiatProcessingFeeBps(
    admin,
    { countryCode, currencyCode: receiveCurrency, rail },
    "pay_out",
    feeSubject,
  )
  const pricing = computeYcBalancePayoutPricingBeforeSend({
    receiveAmount: quoteReceiveAmount,
    customerRate,
    provisionalCryptoUsd: provisionalCrypto,
    ycMidUsd:
      gridMidLocalPerUsd > 0 ? roundUsd(quoteReceiveAmount / gridMidLocalPerUsd) : undefined,
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
  const sequenceId = `grid_preview_${quoteKey.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 80)}`
  const expiresAt = new Date(Date.now() + getGridQuoteTtlMs()).toISOString()
  const displayProcessingFee = computePayoutQuoteDisplayProcessingFee({
    processingFee: pricing.processingFee,
    displayChannelCost: pricing.channelCost,
    channelCost: pricing.channelCost,
  })

  const settlement: PayoutSettlementLeg = {
    totalFee: pricing.channelCost,
    feeCurrency: "USD",
    cryptoAuthorizedAmount: String(provisionalCrypto),
    cryptoFloor: String(provisionalCrypto),
    cryptoSendAmount: String(provisionalCrypto),
    cryptoCurrency: "USDC",
    sessionId: sequenceId,
    customerRate,
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
    pricingQuoteId: sequenceId,
    expiresAt,
    executionModel: "turnkey_workflow",
    provider: "grid",
    quotePhase: "preview",
    requiresConfirm: true,
    quoteKey,
  }
}

/**
 * Lock a Grid balance payout quote: ensure customer + external account, POST /quotes.
 */
export async function lockGridBalancePayoutQuote(
  input: LockGridBalancePayoutQuoteInput,
): Promise<LockGridBalancePayoutQuoteResult> {
  const admin = input.admin ?? createSupabaseAdmin()
  const sourceBalanceCurrency = input.sourceBalanceCurrency.trim().toUpperCase()
  if (sourceBalanceCurrency !== "USD") {
    throw new Error("Grid balance payout supports USD source balance only.")
  }

  const receiveCurrency = String(input.recipient.currency || "").trim().toUpperCase()
  const countryCode = resolveRecipientPayoutCountry(input.recipient)
  if (!countryCode) throw new Error("Recipient country is required for Grid payout.")

  const rail =
    input.recipient.mobile_provider ||
    String(input.recipient.bank_name || "").toLowerCase().includes("mobile money")
      ? ("mobile_money" as const)
      : ("bank_transfer" as const)

  const { customerId } = await ensureGridCustomer({
    admin,
    userId: input.userId,
    businessId: input.businessId,
    scope: input.businessId ? "business" : "individual",
    profile: input.senderProfile,
  })

  const gridCandidates = await loadGridRecipientBankCandidates(admin, {
    countryCode,
    currencyCode: receiveCurrency,
    rail,
  })

  const externalAccount = await createGridExternalAccount({
    customerId,
    recipient: input.recipient,
    profile: input.senderProfile,
    rail,
    gridBankCandidates: gridCandidates.bankNames,
    gridMomoCandidates: gridCandidates.momoProviders,
  })

  const rates = await listGridRates(admin, { destinations: [receiveCurrency], status: "active" })
  const payoutRate = findGridBalancePayoutRate(rates, receiveCurrency)
  const customerRate = payoutRate?.rate ?? 0
  const gridMidLocalPerUsd = payoutRate?.grid_mid ?? 0
  if (!customerRate || customerRate <= 0) {
    throw new Error(`Exchange rate for USD → ${receiveCurrency} is unavailable. Try again shortly.`)
  }

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

  const gridLimits = resolveGridPayoutLimits({
    country: countryCode,
    currency: receiveCurrency,
    rail,
  })
  const limitCheck = validateBalancePayoutAmountForProvider({
    provider: "grid",
    sourceBalanceCurrency,
    amountEntryMode,
    receiveAmount: quoteReceiveAmount,
    sendAmount: sendBudget,
    customerRate,
    sendCurrency: sourceBalanceCurrency,
    receiveCurrency,
    rail,
    ycLimits: gridLimits,
  })
  if (!limitCheck.ok) {
    throw new Error(limitCheck.message)
  }

  const provisionalCrypto = roundUsd(quoteReceiveAmount / customerRate)

  const quoteBody = buildGridBalancePayoutQuoteBody({
    customerId,
    externalAccountId: externalAccount.id,
    receiveCurrency,
    lockedReceiveMinor: gridMinorUnits(quoteReceiveAmount, 2),
    purposeOfPayment: input.paymentPurpose,
  })
  const quote = await gridFetch<GridQuote>({
    method: "POST",
    path: "/quotes",
    json: quoteBody,
    idempotencyKey: buildGridIdempotencyKey(`grid_quote_${customerId}`, quoteBody),
  })

  const hydratedQuote = await hydrateGridQuotePaymentInstructions(quote)
  const fundingAddress = resolveGridQuoteFundingAddress(hydratedQuote)
  if (!fundingAddress) {
    console.warn("[grid] payout quote missing solana funding address", {
      quoteId: hydratedQuote.id,
      paymentInstructionsIsArray: Array.isArray(hydratedQuote.paymentInstructions),
    })
    throw new Error("Grid payout funding instructions are unavailable. Try again shortly.")
  }

  const lockedCustomerRate = resolveGridLockedPayoutCustomerRate({
    quoteExchangeRate: hydratedQuote.exchangeRate,
    previewCustomerRate: customerRate,
  })
  const lockedCryptoUsd = gridQuoteSendingAmountMajor(hydratedQuote) ?? provisionalCrypto
  const gridFeesUsd = gridQuoteFeesUsd(hydratedQuote)
  const processingFeeBps = await quoteFiatProcessingFeeBps(
    admin,
    { countryCode, currencyCode: receiveCurrency, rail },
    "pay_out",
    { userId: input.userId, businessId: input.businessId ?? null },
  )
  const pricing = computeYcBalancePayoutPricingBeforeSend({
    receiveAmount: quoteReceiveAmount,
    customerRate: lockedCustomerRate,
    provisionalCryptoUsd: lockedCryptoUsd > 0 ? lockedCryptoUsd : provisionalCrypto,
    ycMidUsd:
      gridMidLocalPerUsd > 0
        ? roundUsd(quoteReceiveAmount / gridMidLocalPerUsd)
        : undefined,
    processingFeeBps,
  })
  if (gridFeesUsd > 0) {
    pricing.channelCost = roundUsd(pricing.channelCost + gridFeesUsd)
    pricing.totalDebited = roundUsd(pricing.totalDebited + gridFeesUsd)
  }

  const cryptoAmount = roundUsd(lockedCryptoUsd > 0 ? lockedCryptoUsd : pricing.customerPrincipal)
  const sequenceId = `grid_quote_${String(hydratedQuote.id).replace(/[^a-zA-Z0-9:_-]/g, "")}`
  const expiresAt =
    hydratedQuote.expiresAt ?? new Date(Date.now() + getGridQuoteTtlMs()).toISOString()

  return {
    quoteId: String(hydratedQuote.id),
    transactionId: hydratedQuote.transactionId,
    externalAccountId: externalAccount.id,
    customerId,
    sequenceId,
    receiveAmount: quoteReceiveAmount,
    receiveCurrency,
    cryptoAmount: cryptoAmount > 0 ? cryptoAmount : pricing.customerPrincipal,
    fundingAddress,
    exchangeRate: lockedCustomerRate,
    expiresAt,
    pricing: {
      customerPrincipal: pricing.customerPrincipal,
      totalDebited: pricing.totalDebited,
      marginAmount: pricing.marginAmount,
      processingFee: pricing.processingFee,
      channelCost: pricing.channelCost,
      customerRate: lockedCustomerRate,
    },
    quote: hydratedQuote,
  }
}

export function buildGridLockedPayoutQuoteResult(input: {
  locked: LockGridBalancePayoutQuoteResult
  sourceBalanceCurrency: string
  quoteKey: string
  lockId: string
}): PayoutQuoteResult {
  const { locked, sourceBalanceCurrency, quoteKey, lockId } = input
  const displayProcessingFee = computePayoutQuoteDisplayProcessingFee({
    processingFee: locked.pricing.processingFee,
    displayChannelCost: locked.pricing.channelCost,
    channelCost: locked.pricing.channelCost,
  })

  const settlement: PayoutSettlementLeg = {
    totalFee: locked.pricing.channelCost,
    feeCurrency: "USD",
    cryptoAuthorizedAmount: String(locked.cryptoAmount),
    cryptoFloor: String(locked.cryptoAmount),
    cryptoSendAmount: String(locked.cryptoAmount),
    cryptoCurrency: "USDC",
    sessionId: locked.sequenceId,
    customerRate: locked.pricing.customerRate,
    effectiveRate: locked.pricing.customerRate,
    marginCaptureMode: "fee_wallet_deferred",
    channelCost: locked.pricing.channelCost,
    marginAmount: locked.pricing.marginAmount,
    customerPrincipal: locked.pricing.customerPrincipal,
  }

  return {
    receiveAmount: locked.receiveAmount,
    receiveCurrency: locked.receiveCurrency,
    customerPrincipal: locked.pricing.customerPrincipal,
    sendAmount: locked.pricing.customerPrincipal,
    sendCurrency: sourceBalanceCurrency,
    totalDebited: locked.pricing.totalDebited,
    channelCost: locked.pricing.channelCost,
    marginAmount: locked.pricing.marginAmount,
    processingFee: locked.pricing.processingFee,
    displayChannelCost: locked.pricing.channelCost,
    displayProcessingFee,
    settlement,
    noah: buildLegacyNoahSettlementFromLeg(settlement) as PayoutQuoteResult["noah"],
    easner: {
      quoteId: locked.sequenceId,
      expiresAt: locked.expiresAt,
      providerRate: locked.pricing.customerRate,
      effectiveRate: locked.pricing.customerRate,
      destinationAmount: locked.receiveAmount,
      fxMarkupBps: 50,
      payinFeeAmount: 0,
      payoutFeeAmount: locked.pricing.channelCost,
      totalFeeAmount: locked.pricing.marginAmount + locked.pricing.channelCost,
      sourceAmount: locked.pricing.customerPrincipal,
      sourceCurrency: sourceBalanceCurrency,
      destinationCurrency: locked.receiveCurrency,
      pricingTotals: {
        total_easner_fee: locked.pricing.marginAmount,
        total_user_fee: locked.pricing.marginAmount + locked.pricing.channelCost,
        total_recipient_amount: locked.receiveAmount,
      },
    },
    pricingQuoteId: locked.sequenceId,
    expiresAt: locked.expiresAt,
    executionModel: "turnkey_workflow",
    provider: "grid",
    quotePhase: "locked",
    requiresConfirm: false,
    quoteKey,
    lockId,
    grid: {
      quoteId: locked.quoteId,
      sequenceId: locked.sequenceId,
      customerId: locked.customerId,
      externalAccountId: locked.externalAccountId,
      cryptoAmount: locked.cryptoAmount,
      fundingAddress: locked.fundingAddress ?? undefined,
    },
  }
}

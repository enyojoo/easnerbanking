import { createSupabaseAdmin } from "@/lib/supabase/admin"
import {
  computeYcBalancePayoutPricing,
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
  quantizeGridUsdcMajor,
} from "./quote-request"
import { gridFetch } from "./http"
import {
  hydrateGridQuotePaymentInstructions,
  resolveGridQuoteFundingAddress,
  retrieveGridQuote,
} from "./quote-funding"
import { buildPayoutQuoteKey } from "@/lib/payout/payout-quote-key"
import { quoteFiatProcessingFeeBps } from "@/lib/processing-fee/quote-processing-fee-bps"
import {
  getGridPayoutMarginBps,
  getGridQuoteTtlMs,
  gridQuoteNeedsRefresh,
  resolveGridQuoteExpiresAt,
} from "./config"
import type { GridQuote } from "./types"

function storedGridExternalAccountId(recipient: RecipientSellPrepareRow): string | null {
  const meta = recipient.metadata
  const obj = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {}
  const id = String(obj.grid_external_account_id ?? "").trim()
  return id || null
}

function persistRecipientGridExternalAccount(
  admin: ReturnType<typeof createSupabaseAdmin>,
  recipient: RecipientSellPrepareRow,
  externalAccountId: string,
): void {
  const recipientId = String(recipient.id ?? "").trim()
  if (!recipientId) return
  const meta = recipient.metadata
  const obj = meta && typeof meta === "object" ? { ...(meta as Record<string, unknown>) } : {}
  if (String(obj.grid_external_account_id ?? "").trim() === externalAccountId) return
  obj.grid_external_account_id = externalAccountId
  void admin
    .from("recipients")
    .update({ metadata: obj, updated_at: new Date().toISOString() })
    .eq("id", recipientId)
    .then(({ error }) => {
      if (error) {
        console.warn("[grid] persist recipient external account failed:", error.message)
      }
    })
}

function roundUsdc(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 1_000_000) / 1_000_000
}

/** Locked Grid payout: send exactly Grid totalSendingAmount; Easner 1% + FX margin on top. No YC 2% pad. */
export function computeGridLockedBalancePayoutPricing(input: {
  receiveAmount: number
  customerRate: number
  gridSendingUsd: number
  gridMidLocalPerUsd?: number
  gridFeesUsd?: number
  processingFeeBps: number
}): ReturnType<typeof computeYcBalancePayoutPricing> {
  const sending = quantizeGridUsdcMajor(input.gridSendingUsd)
  const ycMidUsd =
    input.gridMidLocalPerUsd != null && input.gridMidLocalPerUsd > 0
      ? roundUsdc(input.receiveAmount / input.gridMidLocalPerUsd)
      : undefined
  const gridFees = Number(input.gridFeesUsd ?? 0)
  return computeYcBalancePayoutPricing({
    receiveAmount: input.receiveAmount,
    customerRate: input.customerRate,
    ycFloorUsd: sending,
    ycMidUsd,
    networkFeeAmountUsd: gridFees > 0 ? gridFees : 0,
    serviceFeeAmountUsd: 0,
    processingFeeBps: input.processingFeeBps,
  })
}

export function buildGridEasnerFeeSlice(input: {
  quoteId: string
  expiresAt: string
  customerRate: number
  receiveAmount: number
  receiveCurrency: string
  sourceCurrency: string
  pricing: {
    customerPrincipal: number
    marginAmount: number
    processingFee: number
    channelCost: number
  }
}): NonNullable<PayoutQuoteResult["easner"]> {
  const userFee = roundUsdc(
    input.pricing.marginAmount + input.pricing.processingFee + input.pricing.channelCost,
  )
  return {
    quoteId: input.quoteId,
    expiresAt: input.expiresAt,
    providerRate: input.customerRate,
    effectiveRate: input.customerRate,
    destinationAmount: input.receiveAmount,
    fxMarkupBps: getGridPayoutMarginBps(),
    payinFeeAmount: 0,
    payoutFeeAmount: roundUsdc(input.pricing.processingFee + input.pricing.channelCost),
    totalFeeAmount: userFee,
    sourceAmount: input.pricing.customerPrincipal,
    sourceCurrency: input.sourceCurrency,
    destinationCurrency: input.receiveCurrency,
    pricingTotals: {
      total_easner_fee: input.pricing.marginAmount,
      total_user_fee: userFee,
      total_recipient_amount: input.receiveAmount,
    },
  }
}

function gridQuoteSequenceId(quoteId: string): string {
  return `grid_quote_${String(quoteId).replace(/[^a-zA-Z0-9:_-]/g, "")}`
}

function gridPayoutQuoteIsStale(quote: Pick<GridQuote, "expiresAt" | "status">): boolean {
  const status = String(quote.status ?? "").trim().toUpperCase()
  if (status === "EXPIRED" || status === "FAILED" || status === "CANCELLED" || status === "CANCELED") {
    return true
  }
  return gridQuoteNeedsRefresh(quote.expiresAt)
}

export function applyLiveGridQuoteToLockedPricing(input: {
  quote: GridQuote
  receiveAmount: number
  customerRate: number
  processingFeeBps: number
  gridMidLocalPerUsd?: number
  fallbackSendingUsd: number
  originalTotalDebited?: number
}): {
  cryptoAmount: number
  pricing: ReturnType<typeof computeGridLockedBalancePayoutPricing>
} {
  const sending =
    gridQuoteSendingAmountMajor(input.quote) ??
    (input.fallbackSendingUsd > 0 ? input.fallbackSendingUsd : 0)
  const pricing = computeGridLockedBalancePayoutPricing({
    receiveAmount: input.receiveAmount,
    customerRate: input.customerRate,
    gridSendingUsd: sending,
    gridMidLocalPerUsd: input.gridMidLocalPerUsd,
    gridFeesUsd: gridQuoteFeesUsd(input.quote),
    processingFeeBps: input.processingFeeBps,
  })
  const cryptoAmount = quantizeGridUsdcMajor(sending > 0 ? sending : pricing.customerPrincipal)
  if (input.originalTotalDebited != null && Number.isFinite(input.originalTotalDebited)) {
    pricing.totalDebited = roundUsdc(Math.max(input.originalTotalDebited, pricing.totalDebited))
  }
  return { cryptoAmount, pricing }
}

export async function ensureFreshGridBalancePayoutQuote(input: {
  quoteId: string
  customerId?: string
  externalAccountId?: string
  receiveCurrency: string
  receiveAmount: number
  paymentPurpose?: string
  customerRate: number
  processingFeeBps: number
  originalTotalDebited: number
  originalCryptoAmount: number
  originalFundingAddress: string
  originalMarginAmount?: number
  originalProcessingFee?: number
}): Promise<
  | {
      ok: true
      quoteId: string
      sequenceId: string
      fundingAddress: string
      cryptoAmount: number
      totalDebited: number
      channelCost: number
      expiresAt: string
      refreshed: boolean
    }
  | { ok: false; error: string }
> {
  const originalQuoteId = String(input.quoteId || "").trim()
  const originalFunding = String(input.originalFundingAddress || "").trim()
  const originalCrypto = quantizeGridUsdcMajor(input.originalCryptoAmount)
  const customerId = String(input.customerId || "").trim()
  const externalAccountId = String(input.externalAccountId || "").trim()

  let live: GridQuote | null = null
  try {
    live = await retrieveGridQuote(originalQuoteId)
  } catch (e) {
    console.warn(
      "[grid] payout quote retrieve before send failed:",
      e instanceof Error ? e.message : e,
    )
  }

  const shouldRefresh = live == null || gridPayoutQuoteIsStale(live)
  if (shouldRefresh) {
    if (!customerId || !externalAccountId) {
      return { ok: false, error: "Grid quote expired. Go back and review again." }
    }
    const quoteBody = buildGridBalancePayoutQuoteBody({
      customerId,
      externalAccountId,
      receiveCurrency: input.receiveCurrency,
      lockedReceiveMinor: gridMinorUnits(input.receiveAmount, 2),
      purposeOfPayment: input.paymentPurpose,
    })
    try {
      live = await gridFetch<GridQuote>({
        method: "POST",
        path: "/quotes",
        json: quoteBody,
        idempotencyKey: buildGridIdempotencyKey(`grid_quote_refresh_${originalQuoteId}`, quoteBody),
      })
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Could not refresh Grid quote. Try again shortly.",
      }
    }
  }

  if (!live) {
    return { ok: false, error: "Grid quote expired. Go back and review again." }
  }

  const hydrated = await hydrateGridQuotePaymentInstructions(live)
  const fundingAddress = resolveGridQuoteFundingAddress(hydrated) || originalFunding
  if (!fundingAddress) {
    return { ok: false, error: "Grid payout funding instructions are unavailable. Try again shortly." }
  }

  const applied = applyLiveGridQuoteToLockedPricing({
    quote: hydrated,
    receiveAmount: input.receiveAmount,
    customerRate: input.customerRate,
    processingFeeBps: input.processingFeeBps,
    fallbackSendingUsd: originalCrypto,
    originalTotalDebited: input.originalTotalDebited,
  })
  if (!(applied.cryptoAmount > 0)) {
    return { ok: false, error: "Grid payout quote is incomplete. Review again." }
  }

  const marginAmount = roundUsdc(
    input.originalMarginAmount != null && Number.isFinite(input.originalMarginAmount)
      ? Math.max(0, input.originalMarginAmount)
      : applied.pricing.marginAmount,
  )
  const processingFee = roundUsdc(
    input.originalProcessingFee != null && Number.isFinite(input.originalProcessingFee)
      ? Math.max(0, input.originalProcessingFee)
      : applied.pricing.processingFee,
  )
  const totalDebited = roundUsdc(
    Math.max(
      input.originalTotalDebited,
      applied.cryptoAmount + marginAmount + processingFee,
    ),
  )

  const quoteId = String(hydrated.id || originalQuoteId).trim()
  return {
    ok: true,
    quoteId,
    sequenceId: gridQuoteSequenceId(quoteId),
    fundingAddress,
    cryptoAmount: applied.cryptoAmount,
    totalDebited,
    channelCost: applied.pricing.channelCost,
    expiresAt: resolveGridQuoteExpiresAt(hydrated.expiresAt),
    refreshed: shouldRefresh || quoteId !== originalQuoteId,
  }
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
  quote?: GridQuote
}

/**
 * Amount-screen Grid preview (Office rates, no Grid API). Confirm locks POST /quotes.
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

  const provisionalCrypto = quantizeGridUsdcMajor(quoteReceiveAmount / customerRate)
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
  const pricing = computeGridLockedBalancePayoutPricing({
    receiveAmount: quoteReceiveAmount,
    customerRate,
    gridSendingUsd: provisionalCrypto,
    gridMidLocalPerUsd: gridMidLocalPerUsd > 0 ? gridMidLocalPerUsd : undefined,
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
    easner: buildGridEasnerFeeSlice({
      quoteId: sequenceId,
      expiresAt,
      customerRate,
      receiveAmount: quoteReceiveAmount,
      receiveCurrency,
      sourceCurrency: sourceBalanceCurrency,
      pricing,
    }),
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
 * Called from confirm (review actuals, Noah parity). Execute only if the lock is missing/stale.
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

  const storedExternalAccountId = storedGridExternalAccountId(input.recipient)
  const lockStartedAt = Date.now()
  const [customerResult, gridCandidates, rates, processingFeeBps] = await Promise.all([
    ensureGridCustomer({
      admin,
      userId: input.userId,
      businessId: input.businessId,
      scope: input.businessId ? "business" : "individual",
      profile: input.senderProfile,
      skipLiveLookup: true,
    }),
    storedExternalAccountId
      ? Promise.resolve({ bankNames: [] as string[], momoProviders: [] })
      : loadGridRecipientBankCandidates(admin, {
          countryCode,
          currencyCode: receiveCurrency,
          rail,
        }),
    listGridRates(admin, { destinations: [receiveCurrency], status: "active" }, {
      backgroundRefresh: false,
    }),
    quoteFiatProcessingFeeBps(
      admin,
      { countryCode, currencyCode: receiveCurrency, rail },
      "pay_out",
      { userId: input.userId, businessId: input.businessId ?? null },
    ),
  ])
  const { customerId } = customerResult

  let externalAccount = storedExternalAccountId
    ? { id: storedExternalAccountId }
    : await createGridExternalAccount({
        customerId,
        recipient: input.recipient,
        profile: input.senderProfile,
        rail,
        gridBankCandidates: gridCandidates.bankNames,
        gridMomoCandidates: gridCandidates.momoProviders,
      })
  persistRecipientGridExternalAccount(admin, input.recipient, externalAccount.id)

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

  const provisionalCrypto = quantizeGridUsdcMajor(quoteReceiveAmount / customerRate)

  const quoteBody = buildGridBalancePayoutQuoteBody({
    customerId,
    externalAccountId: externalAccount.id,
    receiveCurrency,
    lockedReceiveMinor: gridMinorUnits(quoteReceiveAmount, 2),
    purposeOfPayment: input.paymentPurpose,
  })
  let quote: GridQuote
  try {
    quote = await gridFetch<GridQuote>({
      method: "POST",
      path: "/quotes",
      json: quoteBody,
      idempotencyKey: buildGridIdempotencyKey(`grid_quote_${customerId}`, quoteBody),
    })
  } catch (e) {
    if (!storedExternalAccountId) throw e
    const freshCandidates = await loadGridRecipientBankCandidates(admin, {
      countryCode,
      currencyCode: receiveCurrency,
      rail,
    })
    externalAccount = await createGridExternalAccount({
      customerId,
      recipient: input.recipient,
      profile: input.senderProfile,
      rail,
      gridBankCandidates: freshCandidates.bankNames,
      gridMomoCandidates: freshCandidates.momoProviders,
    })
    persistRecipientGridExternalAccount(admin, input.recipient, externalAccount.id)
    const retryBody = buildGridBalancePayoutQuoteBody({
      customerId,
      externalAccountId: externalAccount.id,
      receiveCurrency,
      lockedReceiveMinor: gridMinorUnits(quoteReceiveAmount, 2),
      purposeOfPayment: input.paymentPurpose,
    })
    quote = await gridFetch<GridQuote>({
      method: "POST",
      path: "/quotes",
      json: retryBody,
      idempotencyKey: buildGridIdempotencyKey(`grid_quote_${customerId}`, retryBody),
    })
  }

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
  const applied = applyLiveGridQuoteToLockedPricing({
    quote: hydratedQuote,
    receiveAmount: quoteReceiveAmount,
    customerRate: lockedCustomerRate,
    processingFeeBps,
    gridMidLocalPerUsd: gridMidLocalPerUsd > 0 ? gridMidLocalPerUsd : undefined,
    fallbackSendingUsd: provisionalCrypto,
  })
  const pricing = applied.pricing
  const cryptoAmount = applied.cryptoAmount
  const sequenceId = gridQuoteSequenceId(String(hydratedQuote.id))
  const expiresAt = resolveGridQuoteExpiresAt(hydratedQuote.expiresAt)
  console.info("[grid] payout lock", {
    ms: Date.now() - lockStartedAt,
    reusedExternalAccount: Boolean(storedExternalAccountId),
    quoteId: String(hydratedQuote.id),
  })

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
    easner: buildGridEasnerFeeSlice({
      quoteId: locked.sequenceId,
      expiresAt: locked.expiresAt,
      customerRate: locked.pricing.customerRate,
      receiveAmount: locked.receiveAmount,
      receiveCurrency: locked.receiveCurrency,
      sourceCurrency: sourceBalanceCurrency,
      pricing: locked.pricing,
    }),
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

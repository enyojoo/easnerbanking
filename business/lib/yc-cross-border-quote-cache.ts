import { normalizeYcMomoPhone } from "@easner/shared"
import { fetchWithSession } from "@/lib/fetch-with-session"

export type YcPayInRail = "bank_transfer" | "mobile_money"

export type CrossBorderQuoteResult = {
  ok: true
  provider?: "yellowcard" | "grid"
  quotePhase?: "preview" | "leg2_locked" | "locked"
  quoteKey?: string
  leg2DraftId?: string
  transferId?: string
  transactionId?: string
  easnerTransactionId?: string
  localPayIn: number
  customerRate: number
  processingFee?: number
  ycLegFeesUsd?: number
  displayProcessingFee?: number
  displayProcessingFeeLocal?: number
  displayProcessingFeeCurrency?: string
  provisionalPayIn?: number
  receiveAmount?: number
  receiveCurrency?: string
  bankInfo?: Record<string, unknown> | null
  expiresAt: string
  payInNotice?: string
  payInRail?: YcPayInRail
  sourcePhone?: string
  sourceNetworkId?: string
  sourceNetworkName?: string
}

export type CrossBorderQuoteStashMeta = {
  recipientId: string
  payInCurrency: string
  payInCountry: string
  payInRail: YcPayInRail
  receiveAmount: number
  crossBorderProvider?: "yellowcard" | "grid"
  sourcePhone?: string
  networkId?: string
  sourceNetworkName?: string
}

function crossBorderApiBase(provider: "yellowcard" | "grid" | undefined): string {
  return provider === "grid" ? "/api/grid/cross-border" : "/api/yellowcard/cross-border"
}

function resolveCrossBorderProvider(
  meta: CrossBorderQuoteStashMeta,
): "yellowcard" | "grid" {
  if (meta.crossBorderProvider) return meta.crossBorderProvider
  const stashed = peekCrossBorderQuote()
  if (stashed?.provider === "grid" || stashed?.provider === "yellowcard") {
    return stashed.provider
  }
  return "yellowcard"
}

function isGridCrossBorder(meta: CrossBorderQuoteStashMeta): boolean {
  return resolveCrossBorderProvider(meta) === "grid"
}

let stashed: CrossBorderQuoteResult | null = null
let stashedMeta: CrossBorderQuoteStashMeta | null = null
let stashedLeg2DraftId: string | null = null
let lastQuoteError: string | null = null
let inflightQuote: Promise<CrossBorderQuoteResult | null> | null = null
let inflightQuoteKey = ""
let inflightLeg2Lock: Promise<CrossBorderQuoteResult | null> | null = null
let inflightLeg2LockKey = ""
let inflightConfirm: Promise<CrossBorderQuoteResult | null> | null = null
let inflightConfirmKey = ""

export function quoteMetaKey(meta: CrossBorderQuoteStashMeta): string {
  return [
    meta.recipientId,
    meta.payInCurrency,
    meta.payInCountry,
    meta.payInRail,
    meta.receiveAmount,
    meta.sourcePhone ?? "",
    meta.networkId ?? "",
  ].join("|")
}

export function isCrossBorderQuotePreview(
  quote: CrossBorderQuoteResult | null | undefined,
): boolean {
  return Boolean(quote?.ok && quote.quotePhase === "preview" && !quote.transferId)
}

/** Preview quote from `/quote` — enough for review and Continue. */
export function isUsableCrossBorderQuotePreview(
  quote: CrossBorderQuoteResult | null | undefined,
): quote is CrossBorderQuoteResult {
  return Boolean(
    quote?.ok &&
      quote.expiresAt &&
      quote.localPayIn > 0 &&
      quote.customerRate > 0,
  )
}

/** Leg2 locked — review Continue can trigger leg1 confirm. */
export function isCrossBorderLeg2Locked(
  quote: CrossBorderQuoteResult | null | undefined,
  leg2DraftId?: string | null,
): boolean {
  return Boolean(
    isUsableCrossBorderQuotePreview(quote) &&
      (quote.quotePhase === "leg2_locked" || Boolean(leg2DraftId?.trim())),
  )
}

/** Locked order from `/confirm` — required before pay-in instructions finalize. */
export function isCompleteCrossBorderQuote(
  quote: CrossBorderQuoteResult | null | undefined,
): quote is CrossBorderQuoteResult {
  if (!isUsableCrossBorderQuotePreview(quote)) return false
  if (quote.quotePhase === "locked") return Boolean(quote.transferId)
  return Boolean(quote.transferId)
}

export function stashCrossBorderQuote(
  quote: CrossBorderQuoteResult,
  meta: CrossBorderQuoteStashMeta,
  leg2DraftId?: string | null,
): void {
  if (!isCompleteCrossBorderQuote(quote)) return
  stashed = quote
  stashedMeta = meta
  stashedLeg2DraftId = leg2DraftId?.trim() || null
  lastQuoteError = null
}

export function stashCrossBorderLeg2Lock(
  quote: CrossBorderQuoteResult,
  meta: CrossBorderQuoteStashMeta,
  leg2DraftId: string,
): void {
  if (!isCrossBorderLeg2Locked(quote, leg2DraftId)) return
  stashed = quote
  stashedMeta = meta
  stashedLeg2DraftId = leg2DraftId.trim()
  lastQuoteError = null
}

export function peekCrossBorderQuote(): CrossBorderQuoteResult | null {
  return stashed
}

export function peekCrossBorderLeg2DraftId(): string | null {
  return stashedLeg2DraftId
}

export function peekLastCrossBorderQuoteError(): string | null {
  return lastQuoteError
}

export function clearCrossBorderQuote(): void {
  stashed = null
  stashedMeta = null
  stashedLeg2DraftId = null
  lastQuoteError = null
}

export function isStashedCrossBorderQuoteFresh(meta: CrossBorderQuoteStashMeta): boolean {
  if (!isUsableCrossBorderQuotePreview(stashed) || !stashedMeta) return false
  if (new Date(stashed.expiresAt).getTime() <= Date.now()) return false
  return quoteMetaKey(stashedMeta) === quoteMetaKey(meta)
}

function buildCrossBorderQuoteBody(
  meta: CrossBorderQuoteStashMeta,
  extra?: { leg2DraftId?: string },
): Record<string, unknown> {
  if (!meta.recipientId?.trim()) throw new Error("Recipient is required")
  if (!meta.payInCurrency?.trim() || !meta.payInCountry?.trim()) {
    throw new Error("Pay-in country could not be resolved")
  }
  if (!(meta.receiveAmount > 0)) throw new Error("Enter a valid amount")

  const body: Record<string, unknown> = {
    recipientId: meta.recipientId.trim(),
    receiveAmount: meta.receiveAmount,
    payInCurrency: meta.payInCurrency.trim().toUpperCase(),
    payInCountry: meta.payInCountry.trim().toUpperCase(),
    payInRail: meta.payInRail,
  }

  if (meta.payInRail === "mobile_money") {
    if (!meta.sourcePhone?.trim() || !meta.networkId?.trim()) {
      throw new Error("Mobile number and network are required")
    }
    body.sourcePhone = normalizeYcMomoPhone(meta.sourcePhone.trim(), meta.payInCountry)
    body.networkId = meta.networkId.trim()
    if (meta.sourceNetworkName) body.sourceNetworkName = meta.sourceNetworkName
  }

  if (extra?.leg2DraftId?.trim()) {
    body.leg2DraftId = extra.leg2DraftId.trim()
  }

  return body
}

export async function fetchCrossBorderQuotePreview(
  meta: CrossBorderQuoteStashMeta,
): Promise<CrossBorderQuoteResult> {
  const base = crossBorderApiBase(meta.crossBorderProvider)
  const res = await fetchWithSession(`${base}/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildCrossBorderQuoteBody(meta)),
  })
  const data = (await res.json().catch(() => ({}))) as CrossBorderQuoteResult & {
    error?: string
  }
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Cross-border quote failed")
  }
  return data
}

export async function lockCrossBorderLeg2(
  meta: CrossBorderQuoteStashMeta,
  leg2DraftId?: string,
): Promise<CrossBorderQuoteResult> {
  const base = crossBorderApiBase(meta.crossBorderProvider)
  const draftId =
    leg2DraftId?.trim() ||
    peekCrossBorderLeg2DraftId()?.trim() ||
    peekCrossBorderQuote()?.leg2DraftId?.trim()
  const res = await fetchWithSession(`${base}/lock-leg2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      buildCrossBorderQuoteBody(meta, draftId ? { leg2DraftId: draftId } : undefined),
    ),
  })
  const data = (await res.json().catch(() => ({}))) as CrossBorderQuoteResult & {
    error?: string
  }
  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Cross-border leg2 lock failed")
  }
  return data
}

export async function confirmCrossBorderLeg1(
  meta: CrossBorderQuoteStashMeta,
  leg2DraftId: string,
): Promise<CrossBorderQuoteResult> {
  const base = crossBorderApiBase(meta.crossBorderProvider)
  const res = await fetchWithSession(`${base}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildCrossBorderQuoteBody(meta, { leg2DraftId })),
  })
  const data = (await res.json().catch(() => ({}))) as CrossBorderQuoteResult & {
    error?: string
  }
  if (!res.ok || !data.ok || !data.transferId) {
    throw new Error(data.error || "Cross-border confirm failed")
  }
  return data
}

export async function confirmCrossBorderOrder(
  meta: CrossBorderQuoteStashMeta,
  leg2DraftId?: string,
): Promise<CrossBorderQuoteResult> {
  const base = crossBorderApiBase(meta.crossBorderProvider)
  const res = await fetchWithSession(`${base}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      buildCrossBorderQuoteBody(meta, leg2DraftId ? { leg2DraftId } : undefined),
    ),
  })
  const data = (await res.json().catch(() => ({}))) as CrossBorderQuoteResult & {
    error?: string
  }
  if (!res.ok || !data.ok || !data.transferId) {
    throw new Error(data.error || "Cross-border confirm failed")
  }
  return data
}

/** @deprecated Use fetchCrossBorderQuotePreview */
export async function fetchCrossBorderQuote(
  meta: CrossBorderQuoteStashMeta,
): Promise<CrossBorderQuoteResult> {
  return fetchCrossBorderQuotePreview(meta)
}

export async function ensureCrossBorderQuoteStashed(
  meta: CrossBorderQuoteStashMeta,
): Promise<CrossBorderQuoteResult | null> {
  if (isStashedCrossBorderQuoteFresh(meta)) return peekCrossBorderQuote()

  const key = quoteMetaKey(meta)
  if (inflightQuote && inflightQuoteKey === key) return inflightQuote

  inflightQuoteKey = key
  lastQuoteError = null
  inflightQuote = fetchCrossBorderQuotePreview(meta)
    .then((quote) => {
      if (!quote?.ok || !(quote.localPayIn > 0) || !(quote.customerRate > 0)) {
        lastQuoteError = "Incomplete cross-border quote response."
        return null
      }
      stashed = quote
      stashedMeta = meta
      stashedLeg2DraftId = quote.leg2DraftId?.trim() || null
      lastQuoteError = null
      return quote
    })
    .catch((err) => {
      lastQuoteError = err instanceof Error ? err.message : "quote_failed"
      return null
    })
    .finally(() => {
      inflightQuote = null
      inflightQuoteKey = ""
    })

  return inflightQuote
}

export async function ensureCrossBorderLeg2Locked(
  meta: CrossBorderQuoteStashMeta,
): Promise<CrossBorderQuoteResult | null> {
  // Grid: preview-only until `/confirm` locks with Grid POST /quotes.
  if (isGridCrossBorder(meta)) {
    return ensureCrossBorderQuoteStashed(meta)
  }

  if (
    isStashedCrossBorderQuoteFresh(meta) &&
    isCrossBorderLeg2Locked(peekCrossBorderQuote(), peekCrossBorderLeg2DraftId())
  ) {
    return peekCrossBorderQuote()
  }

  const key = quoteMetaKey(meta)
  if (inflightLeg2Lock && inflightLeg2LockKey === key) return inflightLeg2Lock

  inflightLeg2LockKey = key
  lastQuoteError = null
  inflightLeg2Lock = lockCrossBorderLeg2(meta, peekCrossBorderLeg2DraftId()?.trim())
    .then((quote) => {
      if (quote.quotePhase === "locked" && isCompleteCrossBorderQuote(quote)) {
        stashCrossBorderQuote(quote, meta, quote.leg2DraftId)
        return quote
      }
      const leg2DraftId = quote.leg2DraftId?.trim()
      if (!leg2DraftId || !isCrossBorderLeg2Locked(quote, leg2DraftId)) {
        lastQuoteError = "Incomplete cross-border leg2 lock response."
        return null
      }
      stashCrossBorderLeg2Lock(quote, meta, leg2DraftId)
      return quote
    })
    .catch((err) => {
      lastQuoteError = err instanceof Error ? err.message : "leg2_lock_failed"
      return null
    })
    .finally(() => {
      inflightLeg2Lock = null
      inflightLeg2LockKey = ""
    })

  return inflightLeg2Lock
}

export async function ensureCrossBorderOrderConfirmed(
  meta: CrossBorderQuoteStashMeta,
): Promise<CrossBorderQuoteResult | null> {
  if (isStashedCrossBorderQuoteFresh(meta) && isCompleteCrossBorderQuote(stashed)) {
    return stashed
  }

  const key = quoteMetaKey(meta)
  if (inflightConfirm && inflightConfirmKey === key) return inflightConfirm

  inflightConfirmKey = key
  lastQuoteError = null
  inflightConfirm = (async () => {
    if (isGridCrossBorder(meta)) {
      const preview = await ensureCrossBorderQuoteStashed(meta)
      if (!preview) return null
      const quote = await confirmCrossBorderOrder(meta)
      if (!isCompleteCrossBorderQuote(quote)) {
        lastQuoteError = "Incomplete cross-border confirm response."
        return null
      }
      stashCrossBorderQuote(quote, meta, quote.leg2DraftId)
      return quote
    }

    if (!peekCrossBorderLeg2DraftId()) {
      const leg2 = await ensureCrossBorderLeg2Locked(meta)
      if (!leg2) return null
      if (isCompleteCrossBorderQuote(leg2)) return leg2
    }
    const draftId = peekCrossBorderLeg2DraftId()
    if (!draftId) {
      lastQuoteError = "Cross-border leg2 session missing."
      return null
    }
    const quote = await confirmCrossBorderLeg1(meta, draftId)
    if (!isCompleteCrossBorderQuote(quote)) {
      lastQuoteError = "Incomplete cross-border confirm response."
      return null
    }
    stashCrossBorderQuote(quote, meta, draftId)
    return quote
  })()
    .catch((err) => {
      lastQuoteError = err instanceof Error ? err.message : "confirm_failed"
      return null
    })
    .finally(() => {
      inflightConfirm = null
      inflightConfirmKey = ""
    })

  return inflightConfirm
}

/** Fire-and-forget preview (+ YC leg2 lock) while user is on amount / MoMo setup. */
export function prefetchCrossBorderQuotePipeline(meta: CrossBorderQuoteStashMeta): void {
  void ensureCrossBorderQuoteStashed(meta)
    .then((quote) =>
      quote && !isGridCrossBorder(meta)
        ? ensureCrossBorderLeg2Locked(meta)
        : null,
    )
    .catch(() => {})
}

/** Await preview stash (+ YC leg2 warm) before navigating to review. */
export async function warmCrossBorderQuotePipeline(
  meta: CrossBorderQuoteStashMeta,
): Promise<CrossBorderQuoteResult | null> {
  const preview = await ensureCrossBorderQuoteStashed(meta)
  if (!preview) return null
  if (!isGridCrossBorder(meta)) {
    await ensureCrossBorderLeg2Locked(meta).catch(() => {})
  }
  return peekCrossBorderQuote()
}

export function crossBorderQuoteToFlowState(
  quote: CrossBorderQuoteResult,
  meta: CrossBorderQuoteStashMeta,
) {
  return {
    transferId: quote.transferId ?? "",
    transactionId: quote.transactionId ?? "",
    easnerTransactionId: quote.easnerTransactionId,
    localPayIn: quote.localPayIn,
    customerRate: quote.customerRate,
    provisionalPayIn: quote.provisionalPayIn,
    processingFee: quote.processingFee,
    ycLegFeesUsd: quote.ycLegFeesUsd,
    displayProcessingFeeLocal: quote.displayProcessingFeeLocal,
    bankInfo: quote.bankInfo ?? null,
    expiresAt: quote.expiresAt,
    payInRail: meta.payInRail,
    payInNotice: quote.payInNotice,
    sourcePhone: quote.sourcePhone ?? meta.sourcePhone,
    sourceNetworkName: quote.sourceNetworkName ?? meta.sourceNetworkName,
  }
}

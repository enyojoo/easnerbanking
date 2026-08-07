import { fetchWithSession } from "@/lib/fetch-with-session"
import type { PayoutQuoteResult } from "@/lib/noah/payout-quote"
import { isCompleteLockedPayoutQuote } from "@/lib/payout/payout-quote-completion"
import { mapPayoutQuoteToFlowState } from "@/lib/noah/map-payout-quote-to-flow"
import type { SendFlowState } from "@/lib/send-flow-session"

export type PayoutQuoteStashMeta = {
  recipientId: string
  amountEntryMode: "send" | "receive"
  entryAmount: number
  receiveCurrency: string
  sourceBalanceCurrency: string
  note?: string
  paymentPurpose?: string
}

let stashed: PayoutQuoteResult | null = null
let stashedMeta: PayoutQuoteStashMeta | null = null
let previewStashed: PayoutQuoteResult | null = null
let previewStashedMeta: PayoutQuoteStashMeta | null = null
let lastQuoteError: string | null = null
let inflightQuote: Promise<PayoutQuoteResult | null> | null = null
let inflightQuoteKey = ""
let inflightConfirm: Promise<PayoutQuoteResult | null> | null = null
let inflightConfirmKey = ""

function quoteMetaKey(meta: PayoutQuoteStashMeta): string {
  return [
    meta.recipientId,
    meta.amountEntryMode,
    meta.entryAmount,
    meta.receiveCurrency,
    meta.sourceBalanceCurrency,
    meta.note ?? "",
    meta.paymentPurpose ?? "",
  ].join("|")
}

export function isUsablePayoutQuotePreview(
  quote: PayoutQuoteResult | null | undefined,
): quote is PayoutQuoteResult {
  return Boolean(
    quote?.expiresAt &&
      quote.settlement?.sessionId &&
      quote.settlement.cryptoAuthorizedAmount &&
      quote.easner?.providerRate &&
      quote.easner.providerRate > 0,
  )
}

export function isCompletePayoutQuoteLocked(
  quote: PayoutQuoteResult | null | undefined,
): quote is PayoutQuoteResult {
  return isCompleteLockedPayoutQuote(quote)
}

export function payoutQuoteNeedsConfirmLock(quote: PayoutQuoteResult | null | undefined): boolean {
  if (!quote) return true
  if (quote.quotePhase === "locked" && quote.requiresConfirm === false) return false
  if (quote.requiresConfirm === false && (quote.lockId || quote.grid?.quoteId)) return false
  return quote.requiresConfirm !== false
}

export function stashPayoutQuote(quote: PayoutQuoteResult, meta: PayoutQuoteStashMeta): void {
  if (!isCompletePayoutQuoteLocked(quote)) return
  stashed = quote
  stashedMeta = meta
  lastQuoteError = null
}

export function stashPayoutQuotePreview(
  quote: PayoutQuoteResult,
  meta: PayoutQuoteStashMeta,
): void {
  if (!isUsablePayoutQuotePreview(quote)) return
  previewStashed = quote
  previewStashedMeta = meta
}

export function peekPayoutQuotePreview(): PayoutQuoteResult | null {
  return previewStashed
}

export function isStashedPayoutQuotePreviewFresh(meta: PayoutQuoteStashMeta): boolean {
  if (!isUsablePayoutQuotePreview(previewStashed) || !previewStashedMeta) return false
  if (new Date(previewStashed.expiresAt).getTime() <= Date.now()) return false
  return quoteMetaKey(previewStashedMeta) === quoteMetaKey(meta)
}

export function peekPayoutQuote(): PayoutQuoteResult | null {
  return stashed
}

export function peekLastPayoutQuoteError(): string | null {
  return lastQuoteError
}

export function clearPayoutQuote(): void {
  stashed = null
  stashedMeta = null
  previewStashed = null
  previewStashedMeta = null
  lastQuoteError = null
}

export function isStashedPayoutQuoteFresh(meta: PayoutQuoteStashMeta): boolean {
  if (!isCompletePayoutQuoteLocked(stashed) || !stashedMeta) return false
  if (new Date(stashed.expiresAt).getTime() <= Date.now()) return false
  return quoteMetaKey(stashedMeta) === quoteMetaKey(meta)
}

function buildConfirmBody(meta: PayoutQuoteStashMeta): Record<string, unknown> {
  return {
    recipientId: meta.recipientId,
    receiveAmount: meta.amountEntryMode === "receive" ? meta.entryAmount : undefined,
    sendAmount: meta.amountEntryMode === "send" ? meta.entryAmount : undefined,
    amountEntryMode: meta.amountEntryMode,
    sourceBalanceCurrency: meta.sourceBalanceCurrency,
    ...(meta.note ? { note: meta.note } : {}),
    ...(meta.paymentPurpose ? { paymentPurpose: meta.paymentPurpose } : {}),
  }
}

export async function ensurePayoutQuoteStashed(
  meta: PayoutQuoteStashMeta,
  businessId?: string | null,
): Promise<PayoutQuoteResult | null> {
  if (isStashedPayoutQuoteFresh(meta)) return peekPayoutQuote()

  const key = quoteMetaKey(meta)
  if (inflightQuote && inflightQuoteKey === key) return inflightQuote

  inflightQuoteKey = key
  lastQuoteError = null
  inflightQuote = (async () => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (businessId) headers["X-Easner-Account-Scope"] = "business"
      const res = await fetchWithSession("/api/payouts/quote", {
        method: "POST",
        headers,
        body: JSON.stringify(buildConfirmBody(meta)),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        quote?: PayoutQuoteResult
      }
      if (!res.ok || !data.ok || !data.quote) {
        lastQuoteError = data.error || "Could not load payout quote"
        return null
      }
      if (isUsablePayoutQuotePreview(data.quote)) {
        if (isCompletePayoutQuoteLocked(data.quote)) {
          stashPayoutQuote(data.quote, meta)
        } else {
          stashPayoutQuotePreview(data.quote, meta)
        }
      }
      return data.quote
    } catch (e) {
      lastQuoteError = e instanceof Error ? e.message : "quote_failed"
      return null
    }
  })().finally(() => {
    inflightQuote = null
    inflightQuoteKey = ""
  })

  return inflightQuote
}

export async function ensurePayoutOrderConfirmed(
  meta: PayoutQuoteStashMeta,
  businessId?: string | null,
): Promise<PayoutQuoteResult | null> {
  if (isStashedPayoutQuoteFresh(meta)) return peekPayoutQuote()

  const key = quoteMetaKey(meta)
  if (inflightConfirm && inflightConfirmKey === key) return inflightConfirm

  inflightConfirmKey = key
  lastQuoteError = null
  inflightConfirm = (async () => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (businessId) headers["X-Easner-Account-Scope"] = "business"
      const res = await fetchWithSession("/api/payouts/confirm", {
        method: "POST",
        headers,
        body: JSON.stringify(buildConfirmBody(meta)),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        quote?: PayoutQuoteResult
      }
      if (!res.ok || !data.ok || !data.quote) {
        lastQuoteError = data.error || "Could not lock payout order"
        return null
      }
      if (!isCompletePayoutQuoteLocked(data.quote)) {
        lastQuoteError = "Incomplete locked payout quote"
        return null
      }
      stashPayoutQuote(data.quote, meta)
      return data.quote
    } catch (e) {
      lastQuoteError = e instanceof Error ? e.message : "confirm_failed"
      return null
    }
  })().finally(() => {
    inflightConfirm = null
    inflightConfirmKey = ""
  })

  return inflightConfirm
}

/** Preview when needed, then confirm only if the provider requires a lock step. */
export async function ensurePayoutQuoteLocked(
  meta: PayoutQuoteStashMeta,
  businessId?: string | null,
): Promise<PayoutQuoteResult | null> {
  if (isStashedPayoutQuoteFresh(meta)) return peekPayoutQuote()

  const preview =
    (isStashedPayoutQuotePreviewFresh(meta) ? peekPayoutQuotePreview() : null) ??
    (await ensurePayoutQuoteStashed(meta, businessId))

  if (preview && !payoutQuoteNeedsConfirmLock(preview) && isCompletePayoutQuoteLocked(preview)) {
    stashPayoutQuote(preview, meta)
    return preview
  }

  return ensurePayoutOrderConfirmed(meta, businessId)
}

export function payoutQuoteToFlowState(
  state: SendFlowState,
  quote: PayoutQuoteResult,
): SendFlowState {
  const next = mapPayoutQuoteToFlowState(state, quote)
  if (quote.lockId) {
    next.payoutQuote = { ...next.payoutQuote!, lockId: quote.lockId }
  }
  return next
}

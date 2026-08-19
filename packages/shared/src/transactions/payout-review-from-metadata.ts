/** Nested payout review on ledger metadata (`payout_review`, with `review_snapshot` alias). */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function positiveNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

export function isGridBalancePayoutMetadata(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  if (!meta) return false
  if (String(meta.payout_provider ?? "").toLowerCase() === "grid") return true
  if (String(meta.grid_mode ?? "").toLowerCase() === "balance_payout") return true
  const quoteId = String(meta.grid_quote_id ?? "").trim()
  return quoteId.startsWith("Quote:") || quoteId.length > 0
}

/**
 * Grid execute stores live send/total on the metadata root. Nested `payout_review`
 * can still hold the Office estimate — overlay executed amounts so details match
 * what Grid actually sent.
 */
export function overlayGridExecutedPayoutReview(
  meta: Record<string, unknown>,
  nested: Record<string, unknown>,
): Record<string, unknown> {
  if (!isGridBalancePayoutMetadata(meta)) return nested
  const crypto = positiveNumber(meta.crypto_authorized_amount ?? meta.noah_send_amount)
  const totalDebited = positiveNumber(meta.total_debited)
  if (crypto == null && totalDebited == null) return nested

  const processingFee = positiveNumber(meta.processing_fee)
  const marginAmount = positiveNumber(meta.margin_amount)
  const channelCost = positiveNumber(meta.channel_cost)
  const customerRate = positiveNumber(meta.customer_rate)
  const youSend = crypto ?? positiveNumber(nested.you_send_amount)
  const total = totalDebited ?? positiveNumber(nested.total_debited)

  const next: Record<string, unknown> = { ...nested }
  if (youSend != null) {
    next.you_send_amount = youSend
    next.noah_send_amount = youSend
    next.noah_floor = youSend
  }
  if (total != null) next.total_debited = total
  if (processingFee != null) {
    next.processing_fee = processingFee
    next.easner_fee = processingFee
  }
  if (marginAmount != null) next.margin_amount = marginAmount
  if (channelCost != null) next.channel_cost = channelCost
  if (customerRate != null) next.exchange_rate = customerRate

  if (youSend != null && total != null) {
    const remainder = Math.round((total - youSend - (processingFee ?? 0)) * 1_000_000) / 1_000_000
    next.exchange_fee = remainder >= 0 ? remainder : 0
  }
  return next
}

export function rawPayoutReviewFromMetadata(
  meta: Record<string, unknown> | null | undefined,
): unknown {
  if (!meta || typeof meta !== "object") return null
  const nested = asRecord(meta.payout_review) ?? asRecord(meta.review_snapshot)
  if (!nested) return null
  return overlayGridExecutedPayoutReview(meta, nested)
}

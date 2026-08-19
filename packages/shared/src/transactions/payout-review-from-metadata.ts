/** Nested payout review on ledger metadata (`payout_review`, with `review_snapshot` alias). */
export function rawPayoutReviewFromMetadata(
  meta: Record<string, unknown> | null | undefined,
): unknown {
  if (!meta || typeof meta !== "object") return null
  const nested = meta.payout_review
  if (nested && typeof nested === "object") return nested
  const alias = meta.review_snapshot
  if (alias && typeof alias === "object") return alias
  return null
}

/**
 * List feeds order by `created_at DESC` (ledger insert — when the user initiated / row entered DB).
 * `occurred_at` is provider rail time and may update on webhooks; do not use it for feed sort/display.
 */
export function ledgerOccurredAtForNewRow(now: Date = new Date()): string {
  return now.toISOString()
}

/** Prefer existing occurred_at; otherwise anchor to ledger created_at or now. */
export function resolveLedgerOccurredAt(input: {
  occurredAt?: string | null
  createdAt?: string | null
  fallback?: string
}): string {
  const occ = String(input.occurredAt ?? "").trim()
  if (occ) return occ
  const created = String(input.createdAt ?? "").trim()
  if (created) return created
  return input.fallback ?? ledgerOccurredAtForNewRow()
}

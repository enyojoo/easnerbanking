/**
 * List feeds order by `occurred_at DESC NULLS LAST, created_at DESC`.
 * Rows without occurred_at sink below every dated row — set at insert for pending flows.
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

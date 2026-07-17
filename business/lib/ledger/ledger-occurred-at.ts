/**
 * List feeds order by `occurred_at DESC NULLS LAST, created_at DESC`.
 * Rows without occurred_at sink below every dated row — set at insert for pending flows.
 */
import { resolveLedgerWhenAt } from "@easner/shared"

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

/** User-facing "When" from a ledger row — never updated_at / settled_at / webhook times. */
export function resolveLedgerWhenAtFromRow(row: {
  occurred_at?: unknown
  created_at?: unknown
}): string | null {
  return resolveLedgerWhenAt({
    occurredAt: row.occurred_at != null ? String(row.occurred_at) : null,
    createdAt: row.created_at != null ? String(row.created_at) : null,
  })
}

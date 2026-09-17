/** Lookup id used in `/transactions/[etid]` – ETID, then provider id, then ledger uuid. */
export function officeTransactionDetailId(tx: {
  id?: string | null
  easner_transaction_id?: string | null
  provider_transaction_id?: string | null
}): string {
  return String(tx.easner_transaction_id || tx.provider_transaction_id || tx.id || "").trim()
}

/** Detail href for an office ledger row. Prefers ETID, then provider id, then uuid. */
export function officeTransactionDetailHref(tx: {
  id?: string | null
  easner_transaction_id?: string | null
  provider_transaction_id?: string | null
}): string {
  return `/transactions/${encodeURIComponent(officeTransactionDetailId(tx))}`
}

/** Exact-row href used for related hidden legs (ledger uuid). */
export function officeTransactionLedgerHref(ledgerId: string): string {
  return `/transactions/${encodeURIComponent(String(ledgerId || "").trim())}`
}

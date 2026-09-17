import { easnerPayoutIdFromLedgerRow } from "@/lib/transactions/pick-canonical-ledger-row"

export type OfficeRelatedLegSource = {
  id: string
  easner_transaction_id?: string | null
  provider_transaction_id?: string | null
  metadata?: Record<string, unknown> | null
}

export function officeRelatedLegMatchKeys(row: OfficeRelatedLegSource): {
  etid: string | null
  payoutId: string | null
} {
  const fromColumn = String(row.easner_transaction_id ?? "").trim()
  const fromMeta = String(row.metadata?.easner_transaction_id ?? "").trim()
  const etid = fromColumn || fromMeta || null
  const payoutId = easnerPayoutIdFromLedgerRow({
    id: row.id,
    provider_transaction_id: row.provider_transaction_id,
    metadata: row.metadata,
  })
  return {
    etid: etid || null,
    payoutId: payoutId || null,
  }
}

export function rowMatchesOfficeRelatedKeys(
  row: OfficeRelatedLegSource,
  keys: { etid: string | null; payoutId: string | null },
): boolean {
  const rowKeys = officeRelatedLegMatchKeys(row)
  if (keys.etid && rowKeys.etid && rowKeys.etid === keys.etid) return true
  if (keys.payoutId && rowKeys.payoutId && rowKeys.payoutId === keys.payoutId) return true
  return false
}

/** Drop the canonical row and de-dupe siblings. */
export function filterRelatedOfficeLedgerLegs<T extends { id?: unknown }>(
  canonicalId: string,
  rows: T[],
): T[] {
  const seen = new Set<string>([canonicalId])
  const out: T[] = []
  for (const row of rows) {
    const id = String(row.id ?? "").trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(row)
  }
  return out
}

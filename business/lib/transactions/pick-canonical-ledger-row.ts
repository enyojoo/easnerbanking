export type LedgerDetailCandidate = {
  id: string
  status?: string | null
  provider_transaction_id?: string | null
  updated_at?: string | null
  metadata?: Record<string, unknown> | null
}

function statusRank(status: string | null | undefined): number {
  const st = String(status ?? "").toLowerCase()
  if (st === "settled") return 3
  if (st === "processing") return 2
  if (st === "pending") return 1
  return 0
}

function updatedAtMs(row: LedgerDetailCandidate): number {
  const raw = row.updated_at
  if (!raw) return 0
  const ms = Date.parse(String(raw))
  return Number.isFinite(ms) ? ms : 0
}

/** Pick one ledger row when ETID / metadata lookup returns duplicates. */
export function pickCanonicalLedgerDetailRow(
  rows: LedgerDetailCandidate[],
  opts?: { preferredRowId?: string | null },
): LedgerDetailCandidate | null {
  if (rows.length === 0) return null
  if (rows.length === 1) return rows[0]

  const preferredId = String(opts?.preferredRowId ?? "").trim()
  if (preferredId) {
    const preferred = rows.find((row) => row.id === preferredId)
    if (preferred) return preferred
  }

  const sorted = [...rows].sort((a, b) => {
    const statusDiff = statusRank(b.status) - statusRank(a.status)
    if (statusDiff !== 0) return statusDiff

    return updatedAtMs(b) - updatedAtMs(a)
  })

  return sorted[0] ?? null
}

export function easnerPayoutIdFromLedgerRow(row: LedgerDetailCandidate): string {
  const meta = row.metadata ?? {}
  const fromMeta = String(meta.easner_payout_id ?? "").trim()
  if (fromMeta) return fromMeta
  const ptid = String(row.provider_transaction_id ?? "").trim()
  if (ptid.startsWith("global_payout_pending:")) {
    return ptid.slice("global_payout_pending:".length)
  }
  return ""
}

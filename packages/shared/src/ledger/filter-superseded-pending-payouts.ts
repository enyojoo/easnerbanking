const PENDING_GLOBAL_PAYOUT_PREFIX = "global_payout_pending:"

export type SupersededPayoutLedgerRow = {
  id: string
  status?: string | null
  provider_transaction_id?: string | null
  metadata?: Record<string, unknown> | null
}

function easnerPayoutIdFromRow(row: SupersededPayoutLedgerRow): string {
  const meta = row.metadata ?? {}
  const fromMeta = String(meta.easner_payout_id ?? "").trim()
  if (fromMeta) return fromMeta
  const ptid = String(row.provider_transaction_id ?? "").trim()
  if (ptid.startsWith(PENDING_GLOBAL_PAYOUT_PREFIX)) {
    return ptid.slice(PENDING_GLOBAL_PAYOUT_PREFIX.length)
  }
  return ""
}

function isGlobalFiatPayoutRow(row: SupersededPayoutLedgerRow): boolean {
  return String(row.metadata?.payout_type ?? "").toLowerCase() === "global_fiat"
}

function statusRank(status: string | null | undefined): number {
  const st = String(status ?? "").toLowerCase()
  if (st === "settled") return 3
  if (st === "processing") return 2
  if (st === "pending") return 1
  return 0
}

/**
 * Drop superseded global payout placeholder rows and YC-send-id orphans when a canonical sibling exists.
 */
export function filterSupersededPendingGlobalPayoutRows<T extends SupersededPayoutLedgerRow>(
  rows: T[],
  opts?: { canonicalRowIds?: Set<string> },
): T[] {
  const canonicalRowIds = opts?.canonicalRowIds ?? new Set<string>()
  const payoutGroups = new Map<string, T[]>()

  for (const row of rows) {
    const payoutId = easnerPayoutIdFromRow(row)
    if (!payoutId || !isGlobalFiatPayoutRow(row)) continue
    const group = payoutGroups.get(payoutId) ?? []
    group.push(row)
    payoutGroups.set(payoutId, group)
  }

  const hideIds = new Set<string>()

  for (const [, group] of payoutGroups) {
    if (group.length <= 1) continue

    const nonPending = group.filter(
      (row) => !String(row.provider_transaction_id ?? "").startsWith(PENDING_GLOBAL_PAYOUT_PREFIX),
    )
    if (nonPending.length === 0) continue

    const canonical =
      group.find((row) => canonicalRowIds.has(row.id)) ??
      [...nonPending].sort((a, b) => statusRank(b.status) - statusRank(a.status))[0]

    for (const row of group) {
      if (row.id === canonical?.id) continue
      const ptid = String(row.provider_transaction_id ?? "").trim()
      if (ptid.startsWith(PENDING_GLOBAL_PAYOUT_PREFIX)) {
        hideIds.add(row.id)
        continue
      }
      if (nonPending.length > 0) {
        hideIds.add(row.id)
      }
    }
  }

  return rows.filter((row) => !hideIds.has(row.id))
}

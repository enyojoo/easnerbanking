/** Whether a sync-chain-ledger response should trigger transaction/wallet list refresh. */
export function shouldRefreshAfterChainLedgerSync(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false
  const p = payload as Record<string, unknown>
  const result = p.result as Record<string, unknown> | null | undefined
  const upserts = Number(result?.upserts ?? result?.upserted ?? 0)
  const noah = p.noahReconcile as Record<string, unknown> | null | undefined
  const credited = Number(noah?.credited ?? 0)
  const balanceSync = p.balanceSync as Record<string, unknown> | null | undefined
  const ataSynced = balanceSync?.ok === true
  const organic = p.organicInbound as Record<string, unknown> | null | undefined
  const organicIngested = Number(organic?.ingested ?? 0)
  const resultUpserts = Number(result?.upserts ?? 0)
  return (
    ataSynced ||
    (Number.isFinite(upserts) && upserts > 0) ||
    (Number.isFinite(resultUpserts) && resultUpserts > 0) ||
    (Number.isFinite(organicIngested) && organicIngested > 0) ||
    (Number.isFinite(credited) && credited > 0)
  )
}

/** Pure helpers for routing payout fee capture — safe to import from tests. */

export function isYcBalancePayoutLedgerMeta(meta: Record<string, unknown>): boolean {
  if (String(meta.yc_mode ?? "") === "balance_payout") return true
  return (
    String(meta.payout_provider ?? "").toLowerCase() === "yellowcard" &&
    String(meta.payout_type ?? "") === "global_fiat"
  )
}

export function isGridBalancePayoutLedgerMeta(meta: Record<string, unknown>): boolean {
  if (String(meta.grid_mode ?? "").toLowerCase() === "balance_payout") return true
  return (
    String(meta.payout_provider ?? "").toLowerCase() === "grid" &&
    (String(meta.payout_type ?? "") === "global_fiat" ||
      String(meta.flow ?? "") === "global_fiat_offramp")
  )
}

/** Noah global fiat off-ramp only — never YC or Grid balance payout. */
export function isNoahGlobalPayoutLedgerMeta(meta: Record<string, unknown>): boolean {
  if (isYcBalancePayoutLedgerMeta(meta)) return false
  if (isGridBalancePayoutLedgerMeta(meta)) return false
  return (
    String(meta.payout_type ?? "") === "global_fiat" &&
    String(meta.execution_model ?? "") === "turnkey_workflow"
  )
}

/** User-facing global fiat off-ramp (balance → bank / mobile money). */
export function isGlobalPayoutOffRampFlow(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  if (!metadata || typeof metadata !== "object") return false
  if (String(metadata.payout_type ?? "").toLowerCase() === "global_fiat") return true
  if (String(metadata.flow ?? "").toLowerCase() === "global_fiat_offramp") return true
  return String(metadata.grid_mode ?? "").toLowerCase() === "balance_payout"
}

export function isGlobalPayoutOffRampOutRow(row: {
  direction?: unknown
  metadata?: Record<string, unknown> | null
}): boolean {
  const dir = String(row.direction ?? "").toLowerCase()
  if (dir !== "out") return false
  return isGlobalPayoutOffRampFlow(row.metadata)
}

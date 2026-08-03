export type YcAdaptiveLockFlow = "balance_payout" | "cross_border"

/** Safe rollout/kill switches. Adaptive never-underpay locking is enabled unless explicitly false. */
export function isYcAdaptiveLockEnabled(flow: YcAdaptiveLockFlow): boolean {
  const key =
    flow === "balance_payout"
      ? "YC_ADAPTIVE_LOCK_BALANCE_PAYOUT"
      : "YC_ADAPTIVE_LOCK_CROSS_BORDER"
  const value = String(process.env[key] ?? "true").trim().toLowerCase()
  return value !== "false" && value !== "0" && value !== "off"
}

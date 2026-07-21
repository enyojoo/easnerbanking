/** Per-provider rollout for lock-on-review balance payout UX. */
export function isPayoutLockOnReviewEnabled(provider: "noah" | "yellowcard" | "wallet"): boolean {
  const global = String(process.env.PAYOUT_LOCK_ON_REVIEW || "").trim().toLowerCase()
  if (global === "true" || global === "1") return true
  if (global === "false" || global === "0") return false

  const key =
    provider === "noah"
      ? "PAYOUT_LOCK_ON_REVIEW_NOAH"
      : provider === "yellowcard"
        ? "PAYOUT_LOCK_ON_REVIEW_YELLOWCARD"
        : "PAYOUT_LOCK_ON_REVIEW_WALLET"
  const v = String(process.env[key] || "").trim().toLowerCase()
  if (v === "true" || v === "1") return true
  if (v === "false" || v === "0") return false
  // YC POST /send creates a real pending payout — lock only after PIN at execute.
  if (provider === "yellowcard") return false
  return true
}

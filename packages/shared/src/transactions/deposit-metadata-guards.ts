/**
 * Leaf deposit-metadata predicates.
 * Kept free of cross-imports so Metro/web bundlers never hit TDZ from cycles like
 * bank-deposit-lifecycle ↔ yc-deposit-display.
 */

export function isBankOnrampDepositFlow(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  if (!metadata || typeof metadata !== "object") return false
  return String(metadata.flow ?? "").toLowerCase() === "bank_onramp"
}

export function isYcFundBalanceDepositMetadata(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  if (!meta || typeof meta !== "object") return false
  return meta.yc_mode === "fund_balance"
}

export function isVerificationDepositMetadata(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  if (!metadata || typeof metadata !== "object") return false
  return String(metadata.deposit_kind ?? "").toLowerCase() === "verification"
}

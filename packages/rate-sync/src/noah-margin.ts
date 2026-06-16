/** Global payout customer margin (distinct from P2P `EASNER_BRIDGE_MARGIN`). */
export const NOAH_PAYOUT_MARGIN = 0.5 / 100

/** Margin as basis points (50 = 0.5%). */
export function easnerBridgeMarginBps(margin = NOAH_PAYOUT_MARGIN): number {
  return Math.round(margin * 10_000)
}

export function parseNoahPayoutMarginFromEnv(raw: string | undefined): number {
  const parsed = Number.parseFloat(String(raw ?? "").trim())
  if (!Number.isFinite(parsed) || parsed < 0 || parsed >= 1) return NOAH_PAYOUT_MARGIN
  return parsed
}

/**
 * Customer-facing payout rate from Noah mid.
 * Outbound global payout: user receives fewer destination units per 1 source unit.
 */
export function applyNoahCustomerRate(
  noahMid: number,
  margin = NOAH_PAYOUT_MARGIN,
): number {
  if (!Number.isFinite(noahMid) || noahMid <= 0) {
    throw new Error("noahMid must be a positive finite number")
  }
  if (!Number.isFinite(margin) || margin < 0 || margin >= 1) {
    throw new Error("margin must be in [0, 1)")
  }
  return Number((noahMid * (1 - margin)).toPrecision(14))
}

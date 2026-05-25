/** Global payout customer margin (distinct from P2P `EASNER_BRIDGE_MARGIN`). */
export const NOAH_PAYOUT_MARGIN = 1.5 / 100

/** Margin as basis points (150 = 1.5%). */
export function easnerBridgeMarginBps(margin = NOAH_PAYOUT_MARGIN): number {
  return Math.round(margin * 10_000)
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

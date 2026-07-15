/** Yellowcard customer margin — same 0.5% as Noah payout margin. */
export const YC_PAYOUT_MARGIN = 0.5 / 100

export function easnerYcMarginBps(margin = YC_PAYOUT_MARGIN): number {
  return Math.round(margin * 10_000)
}

export function parseYcPayoutMarginFromEnv(raw: string | undefined): number {
  const parsed = Number.parseFloat(String(raw ?? "").trim())
  if (!Number.isFinite(parsed) || parsed < 0 || parsed >= 1) return YC_PAYOUT_MARGIN
  return parsed
}

/** Customer payout rate: fewer local units per USDC. */
export function applyYcCustomerBuy(ycBuy: number, margin = YC_PAYOUT_MARGIN): number {
  if (!Number.isFinite(ycBuy) || ycBuy <= 0) {
    throw new Error("ycBuy must be a positive finite number")
  }
  if (!Number.isFinite(margin) || margin < 0 || margin >= 1) {
    throw new Error("margin must be in [0, 1)")
  }
  return Number((ycBuy * (1 - margin)).toPrecision(14))
}

/** Customer pay-in rate: more local units per USDC. */
export function applyYcCustomerSell(ycSell: number, margin = YC_PAYOUT_MARGIN): number {
  if (!Number.isFinite(ycSell) || ycSell <= 0) {
    throw new Error("ycSell must be a positive finite number")
  }
  if (!Number.isFinite(margin) || margin < 0 || margin >= 1) {
    throw new Error("margin must be in [0, 1)")
  }
  return Number((ycSell / (1 - margin)).toPrecision(14))
}

/**
 * Customer cross rate (to/from): (yc_buy_to / yc_sell_from) × (1 − margin)
 * ≡ easner_buy_to / easner_sell_from
 */
export function applyYcCustomerCrossRate(
  ycBuyTo: number,
  ycSellFrom: number,
  margin = YC_PAYOUT_MARGIN,
): { ycCrossMid: number; rate: number } {
  if (!Number.isFinite(ycBuyTo) || ycBuyTo <= 0) {
    throw new Error("ycBuyTo must be positive")
  }
  if (!Number.isFinite(ycSellFrom) || ycSellFrom <= 0) {
    throw new Error("ycSellFrom must be positive")
  }
  const ycCrossMid = Number((ycBuyTo / ycSellFrom).toPrecision(14))
  const rate = Number((ycCrossMid * (1 - margin)).toPrecision(14))
  return { ycCrossMid, rate }
}

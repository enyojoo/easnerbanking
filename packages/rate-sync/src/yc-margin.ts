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

/**
 * Customer payout/disbursement rate (USD → local): fewer local units per USDC.
 * Applies margin to YC **sell** (crypto → local).
 */
export function applyYcCustomerBuy(ycSell: number, margin = YC_PAYOUT_MARGIN): number {
  if (!Number.isFinite(ycSell) || ycSell <= 0) {
    throw new Error("ycSell must be a positive finite number")
  }
  if (!Number.isFinite(margin) || margin < 0 || margin >= 1) {
    throw new Error("margin must be in [0, 1)")
  }
  return Number((ycSell * (1 - margin)).toPrecision(14))
}

/**
 * Customer pay-in/collection rate (local → USDC): more local units per USDC credit.
 * Applies margin to YC **buy** (local → crypto).
 */
export function applyYcCustomerSell(ycBuy: number, margin = YC_PAYOUT_MARGIN): number {
  if (!Number.isFinite(ycBuy) || ycBuy <= 0) {
    throw new Error("ycBuy must be a positive finite number")
  }
  if (!Number.isFinite(margin) || margin < 0 || margin >= 1) {
    throw new Error("margin must be in [0, 1)")
  }
  return Number((ycBuy / (1 - margin)).toPrecision(14))
}

/**
 * Customer cross rate (to per from): (yc_sell_to / yc_buy_from) × (1 − margin).
 * Pay-in leg uses YC buy; payout leg uses YC sell.
 */
export function applyYcCustomerCrossRate(
  ycSellTo: number,
  ycBuyFrom: number,
  margin = YC_PAYOUT_MARGIN,
): { ycCrossMid: number; rate: number } {
  if (!Number.isFinite(ycSellTo) || ycSellTo <= 0) {
    throw new Error("ycSellTo must be positive")
  }
  if (!Number.isFinite(ycBuyFrom) || ycBuyFrom <= 0) {
    throw new Error("ycBuyFrom must be positive")
  }
  const ycCrossMid = Number((ycSellTo / ycBuyFrom).toPrecision(14))
  const rate = Number((ycCrossMid * (1 - margin)).toPrecision(14))
  return { ycCrossMid, rate }
}

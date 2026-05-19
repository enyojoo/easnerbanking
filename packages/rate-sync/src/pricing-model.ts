/** Aligned with docs/easner-p2p-pricing-model.md */

export type TierName = "A" | "B"

export interface TierParams {
  b: number
  m: number
  cap_buy: number
  cap_sell: number
  name: TierName
  buyMult: number
  sellMult: number
}

/**
 * Symmetric retail spread around the USDC bridge (before Step C/D).
 * Decimal fraction (5% → `5 / 100`).
 */
export const EASNER_BRIDGE_MARGIN = 5 / 100

const STEP_B_FULL_BUY = 1 + EASNER_BRIDGE_MARGIN
const STEP_B_FULL_SELL = 1 - EASNER_BRIDGE_MARGIN

const STEP_B_EM = {
  buyMult: Math.sqrt(STEP_B_FULL_BUY),
  sellMult: Math.sqrt(STEP_B_FULL_SELL),
}

const STEP_B_BRIDGE_CCY = { buyMult: 1, sellMult: 1 }

const CAP_BUFFER = 0
const CAP_WIDE = {
  cap_buy: EASNER_BRIDGE_MARGIN + CAP_BUFFER,
  cap_sell: EASNER_BRIDGE_MARGIN + CAP_BUFFER,
}

export function tierForCurrency(ccy: string): TierParams {
  if (ccy === "USD") {
    return {
      b: 0,
      m: 0.002,
      name: "A",
      ...STEP_B_BRIDGE_CCY,
      ...CAP_WIDE,
    }
  }
  return {
    b: 0,
    m: 0.005,
    name: "B",
    ...STEP_B_EM,
    ...CAP_WIDE,
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi)
}

export interface EasnerLegs {
  BUY: number
  SELL: number
  mid: number
  Bprime: number
  Sprime: number
  easner_buy: number
  easner_sell: number
  tier: TierName
}

export function pipeline(buy: number, sell: number, t: TierParams): EasnerLegs {
  const mid = (buy + sell) / 2
  const bandLo = -t.b * mid
  const bandHi = t.b * mid
  const Bp = mid + clamp(buy - mid, bandLo, bandHi)
  const Sp = mid + clamp(sell - mid, bandLo, bandHi)
  let cbr = Bp * t.buyMult
  let csr = Sp * t.sellMult
  if (cbr < csr * (1 + t.m)) {
    cbr = csr * (1 + t.m)
  }
  let cb = cbr
  let cs = csr
  const mid_c = (cb + cs) / 2
  cb = Math.min(cb, mid_c * (1 + t.cap_buy))
  cs = Math.max(cs, mid_c * (1 - t.cap_sell))
  return {
    BUY: buy,
    SELL: sell,
    mid,
    Bprime: Bp,
    Sprime: Sp,
    easner_buy: cb,
    easner_sell: cs,
    tier: t.name,
  }
}

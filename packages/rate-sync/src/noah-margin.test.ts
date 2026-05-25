import { describe, expect, it } from "vitest"
import {
  applyNoahCustomerRate,
  easnerBridgeMarginBps,
  NOAH_PAYOUT_MARGIN,
} from "./noah-margin"

describe("applyNoahCustomerRate", () => {
  it("applies payout margin to Noah mid", () => {
    const mid = 1356.045
    const rate = applyNoahCustomerRate(mid)
    expect(rate).toBeCloseTo(mid * (1 - NOAH_PAYOUT_MARGIN), 2)
    expect(rate).toBeCloseTo(1315.36, 1)
  })

  it("rejects invalid mid", () => {
    expect(() => applyNoahCustomerRate(0)).toThrow()
  })
})

describe("easnerBridgeMarginBps", () => {
  it("returns 300 for default 3% Noah payout margin", () => {
    expect(easnerBridgeMarginBps()).toBe(300)
  })
})

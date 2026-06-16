import { describe, expect, it } from "vitest"
import {
  applyNoahCustomerRate,
  easnerBridgeMarginBps,
  NOAH_PAYOUT_MARGIN,
  parseNoahPayoutMarginFromEnv,
} from "./noah-margin"

describe("applyNoahCustomerRate", () => {
  it("applies payout margin to Noah mid", () => {
    const mid = 1356.045
    const rate = applyNoahCustomerRate(mid)
    expect(rate).toBeCloseTo(mid * (1 - NOAH_PAYOUT_MARGIN), 2)
    expect(rate).toBeCloseTo(1349.3, 1)
  })

  it("rejects invalid mid", () => {
    expect(() => applyNoahCustomerRate(0)).toThrow()
  })
})

describe("easnerBridgeMarginBps", () => {
  it("returns 50 for default 0.5% Noah payout margin", () => {
    expect(easnerBridgeMarginBps()).toBe(50)
  })
})

describe("parseNoahPayoutMarginFromEnv", () => {
  it("returns default when unset or invalid", () => {
    expect(parseNoahPayoutMarginFromEnv(undefined)).toBe(NOAH_PAYOUT_MARGIN)
    expect(parseNoahPayoutMarginFromEnv("")).toBe(NOAH_PAYOUT_MARGIN)
    expect(parseNoahPayoutMarginFromEnv("bad")).toBe(NOAH_PAYOUT_MARGIN)
    expect(parseNoahPayoutMarginFromEnv("1")).toBe(NOAH_PAYOUT_MARGIN)
  })

  it("parses decimal fraction from env", () => {
    expect(parseNoahPayoutMarginFromEnv("0.01")).toBe(0.01)
  })
})

import { describe, expect, it } from "vitest"
import { computeCryptoSendPricing } from "./crypto-send-pricing"

describe("computeCryptoSendPricing", () => {
  it("total debited equals you-send principal plus route cost (margin not additive to both)", () => {
    const p = computeCryptoSendPricing({
      receiveAmount: 100,
      customerRate: 0.985,
      lifiMid: 1,
      lifiFloor: 103,
    })
    expect(p.marginAmount).toBeGreaterThan(0)
    expect(p.totalDebited).toBeCloseTo(p.customerPrincipal + p.routeCost, 6)
    expect(p.totalDebited).not.toBeCloseTo(
      p.customerPrincipal + p.routeCost + p.marginAmount,
      4,
    )
  })
})

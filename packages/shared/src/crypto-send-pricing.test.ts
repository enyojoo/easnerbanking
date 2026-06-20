import { describe, expect, it } from "vitest"
import {
  computeCryptoSendPricing,
  resolveLifiTicketPricingInput,
} from "./crypto-send-pricing"

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

describe("resolveLifiTicketPricingInput", () => {
  it("uses ticket mid when floor is inflated vs planning mid (USDT/Tron pattern)", () => {
    const lifiFloor = 21.5945
    const { customerRate, lifiMid } = resolveLifiTicketPricingInput({
      planningCustomerRate: 0.963282,
      planningLifiMid: 0.977951,
      lifiFloor,
      receiveAmount: 10,
      margin: 0.015,
    })
    const p = computeCryptoSendPricing({
      receiveAmount: 10,
      customerRate,
      lifiMid,
      lifiFloor,
    })
    expect(p.routeCost).toBeCloseTo(0, 4)
    expect(p.totalDebited).toBeCloseTo(p.customerPrincipal, 4)
    expect(p.customerPrincipal).toBeGreaterThan(21)
    expect(p.customerPrincipal).toBeLessThan(22)
  })
})

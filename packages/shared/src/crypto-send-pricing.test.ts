import { describe, expect, it } from "vitest"
import {
  computeCryptoSendPricing,
  resolveLifiTicketPricingInput,
} from "./crypto-send-pricing"

describe("computeCryptoSendPricing", () => {
  it("total debited = you-send principal + route cost + explicit processing fee (FX margin not additive)", () => {
    const p = computeCryptoSendPricing({
      receiveAmount: 100,
      customerRate: 0.985,
      lifiMid: 1,
      lifiFloor: 103,
    })
    expect(p.marginAmount).toBeGreaterThan(0)
    // Explicit Easner 1% leg is charged on top of the FX margin now.
    expect(p.processingFee).toBeCloseTo(p.customerPrincipal * 0.01, 6)
    // Footing: Total = Sending + (processing fee + display channel component).
    expect(p.displayChannelCost).toBeCloseTo(p.routeCost, 6)
    expect(p.totalDebited).toBeCloseTo(
      p.customerPrincipal + p.displayChannelCost + p.processingFee,
      6,
    )
    // FX margin is folded into the customer rate (Sending), not added a second time.
    expect(p.totalDebited).not.toBeCloseTo(
      p.customerPrincipal + p.routeCost + p.marginAmount + p.processingFee,
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
    // No route cost, so Total = Sending + explicit 1% processing fee.
    expect(p.totalDebited).toBeCloseTo(p.customerPrincipal + p.processingFee, 4)
    expect(p.processingFee).toBeCloseTo(p.customerPrincipal * 0.01, 4)
    expect(p.customerPrincipal).toBeGreaterThan(21)
    expect(p.customerPrincipal).toBeLessThan(22)
  })
})

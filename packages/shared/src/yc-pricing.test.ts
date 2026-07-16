import { describe, expect, it } from "vitest"
import {
  computeYcBalancePayoutPricing,
  computeYcCrossBorderPricing,
  computeYcFundBalancePricing,
} from "./yc-pricing"

describe("computeYcBalancePayoutPricing", () => {
  it("mirrors Noah-style debit = floor + margin + processing", () => {
    const p = computeYcBalancePayoutPricing({
      receiveAmount: 10000,
      customerRate: 1500,
      ycFloorUsd: 6.8,
      ycMidUsd: 6.5,
      networkFeeAmountUsd: 0.1,
      serviceFeeAmountUsd: 0.2,
    })
    expect(p.customerPrincipal).toBeCloseTo(10000 / 1500, 4)
    expect(p.totalDebited).toBeGreaterThan(p.customerPrincipal)
    expect(p.processingFee).toBeGreaterThan(0)
  })
})

describe("computeYcCrossBorderPricing", () => {
  it("solves pay-in above provisional for sandbox-like NGN→KES", () => {
    const p = computeYcCrossBorderPricing({
      receiveAmount: 9062,
      customerRate: 0.0949,
      ycSellFrom: 1420,
      ycBuyTo: 135,
      receiveLeg: {
        cryptoAmountUsd: 70.09,
        networkFeeAmountUsd: 1.5,
        serviceFeeAmountUsd: 0.7,
      },
      sendLeg: {
        cryptoAmountUsd: 69.74,
        networkFeeAmountUsd: 0.2,
        serviceFeeAmountUsd: 0.7,
      },
    })
    expect(p.provisionalPayIn).toBeCloseTo(9062 / 0.0949, 0)
    expect(p.localPayIn).toBeGreaterThan(p.provisionalPayIn)
    expect(p.processingFee).toBeGreaterThan(0)
  })
})

describe("computeYcFundBalancePricing", () => {
  it("applies Easner 1% processing fee on USD credit target", () => {
    const p = computeYcFundBalancePricing({
      usdCredit: 100,
      customerSellRate: 1600,
      ycSellRate: 1590,
      receiveLeg: {
        cryptoAmountUsd: 101.5,
        networkFeeAmountUsd: 1,
        serviceFeeAmountUsd: 0.5,
      },
    })
    expect(p.processingFee).toBeCloseTo(1, 4)
    expect(p.ycLegFeesUsd).toBeCloseTo(1.5, 4)
    expect(p.usdCredit).toBe(100)
  })
})

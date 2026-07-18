import { describe, expect, it } from "vitest"
import { computeYcFundBalancePricingBeforeReceive } from "@easner/shared"
import { buildFundBalanceQuoteSummary } from "./build-yc-quote-response"

describe("buildFundBalanceQuoteSummary", () => {
  it("sets provisionalPayIn to padded local pay-in, not zero-fee recompute", () => {
    const pricing = computeYcFundBalancePricingBeforeReceive({
      usdCredit: 2550,
      customerSellRate: 132.5,
      ycSellRate: 130,
      rail: "bank_transfer",
    })
    const summary = buildFundBalanceQuoteSummary({
      pricing,
      currency: "KES",
      customerRate: 132.5,
      rail: "bank_transfer",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      transactionId: "tx_test",
      transferId: "tr_test",
    })
    expect(summary.provisionalPayIn).toBe(pricing.localPayIn)
    expect(summary.localPayIn).toBe(pricing.localPayIn)
    expect(summary.provisionalPayIn).toBeGreaterThan(2550 * 132.5)
  })
})

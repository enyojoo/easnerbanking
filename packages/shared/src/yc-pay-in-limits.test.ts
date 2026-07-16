import { describe, expect, it } from "vitest"
import {
  parseYcChannelPayInLimits,
  parseYcReceiveRejectedMinError,
  resolveYcPayInLimits,
  validateYcPayInLocalAmount,
  computeEnteredAmountForLocalPayInMin,
} from "./yc-pay-in-limits"

describe("parseYcChannelPayInLimits", () => {
  it("reads minAmount and maxAmount from channel", () => {
    expect(
      parseYcChannelPayInLimits({ minAmount: 2500, maxAmount: 1_000_000 }),
    ).toEqual({ minLocalPayIn: 2500, maxLocalPayIn: 1_000_000 })
  })

  it("treats max 0 as unlimited", () => {
    expect(parseYcChannelPayInLimits({ min: 500, max: 0 })).toEqual({
      minLocalPayIn: 500,
      maxLocalPayIn: null,
    })
  })
})

describe("resolveYcPayInLimits", () => {
  it("falls back to published NG bank minimum when channel has no limits", () => {
    expect(
      resolveYcPayInLimits({
        country: "NG",
        currency: "NGN",
        rail: "bank_transfer",
        channel: { country: "NG", currency: "NGN" },
      }),
    ).toEqual({ minLocalPayIn: 2500, maxLocalPayIn: 30_000_000 })
  })

  it("prefers channel limits over fallback", () => {
    expect(
      resolveYcPayInLimits({
        country: "NG",
        currency: "NGN",
        rail: "bank_transfer",
        channel: { minAmount: 3000, maxAmount: 5000 },
      }),
    ).toEqual({ minLocalPayIn: 3000, maxLocalPayIn: 5000 })
  })
})

describe("parseYcReceiveRejectedMinError", () => {
  it("parses YC receive rejection copy", () => {
    expect(parseYcReceiveRejectedMinError("amount must be more than 2500 NGN")).toEqual({
      minLocalPayIn: 2500,
      currency: "NGN",
    })
  })
})

describe("computeEnteredAmountForLocalPayInMin", () => {
  it("returns local minimum in local entry mode", () => {
    expect(
      computeEnteredAmountForLocalPayInMin({
        minLocalPayIn: 2500,
        amountEntryMode: "local",
        customerSellRate: 1600,
      }),
    ).toBe(2500)
  })

  it("bumps USD until preview local meets minimum", () => {
    const usd = computeEnteredAmountForLocalPayInMin({
      minLocalPayIn: 2500,
      amountEntryMode: "usd",
      customerSellRate: 1600,
    })
    expect(usd * 1600).toBeGreaterThanOrEqual(2500)
  })
})

describe("validateYcPayInLocalAmount", () => {
  it("rejects below minimum", () => {
    const result = validateYcPayInLocalAmount({
      localPayIn: 1000,
      currency: "NGN",
      limits: { minLocalPayIn: 2500, maxLocalPayIn: null },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain("2,500")
      expect(result.message).toContain("Minimum deposit")
    }
  })
})

import { describe, expect, it } from "vitest"
import { estimateLifiFromAmountRaw, lifiFromAmountRawForSendBudget } from "../lifi-from-amount"

describe("lifiFromAmountRawForSendBudget", () => {
  it("converts USDC send budget to 6-decimal base units", () => {
    expect(lifiFromAmountRawForSendBudget(10, 6)).toBe("10000000")
  })
})

describe("estimateLifiFromAmountRaw", () => {
  it("returns a positive integer string for receive-mode quotes", () => {
    const raw = estimateLifiFromAmountRaw({
      receiveAmount: 100,
      customerRate: 0.95,
      lifiMid: 1,
      sourceDecimals: 6,
    })
    expect(raw).toMatch(/^[1-9]\d*$/)
    expect(Number(raw)).toBeGreaterThanOrEqual(105_000_000)
  })
})

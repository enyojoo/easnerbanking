import { describe, expect, it } from "vitest"
import { computeFootedDisplayProcessingFee } from "./payout-processing-fee"
import { computeBalancePayoutExchangeFee } from "./payout-review-fees"

describe("computeBalancePayoutExchangeFee", () => {
  it("returns total debited minus you send minus processing fee", () => {
    expect(computeBalancePayoutExchangeFee(105.5, 100, 2)).toBe(3.5)
  })

  it("never returns negative", () => {
    expect(computeBalancePayoutExchangeFee(100, 100, 0)).toBe(0)
  })
})

describe("computeFootedDisplayProcessingFee", () => {
  it("makes the displayed YC balance payout rows add up", () => {
    expect(
      computeFootedDisplayProcessingFee({
        sendingAmount: 1.472563,
        totalDebited: 1.497089,
        fallbackFee: 0.024526,
      }),
    ).toBe(0.03)
  })

  it("uses rounded minor units rather than changing authoritative amounts", () => {
    const quote = {
      sendingAmount: 1.472563,
      totalDebited: 1.497089,
      fallbackFee: 0.024526,
    }
    expect(computeFootedDisplayProcessingFee(quote)).toBe(0.03)
    expect(quote).toEqual({
      sendingAmount: 1.472563,
      totalDebited: 1.497089,
      fallbackFee: 0.024526,
    })
  })

  it("falls back safely when display principals are unavailable", () => {
    expect(
      computeFootedDisplayProcessingFee({
        sendingAmount: Number.NaN,
        totalDebited: Number.NaN,
        fallbackFee: 0.024526,
      }),
    ).toBe(0.02)
  })
})

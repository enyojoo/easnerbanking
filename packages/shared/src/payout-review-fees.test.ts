import { describe, expect, it } from "vitest"
import { computeBalancePayoutExchangeFee } from "./payout-review-fees"

describe("computeBalancePayoutExchangeFee", () => {
  it("returns total debited minus you send minus processing fee", () => {
    expect(computeBalancePayoutExchangeFee(105.5, 100, 2)).toBe(3.5)
  })

  it("never returns negative", () => {
    expect(computeBalancePayoutExchangeFee(100, 100, 0)).toBe(0)
  })
})

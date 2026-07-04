import { describe, expect, it } from "vitest"
import {
  computeCustomerDepositFee,
  computeEasnerMarginFromOmnibus,
  isDepositSplitEconomicsValid,
} from "./deposit-fee-pricing"

describe("computeCustomerDepositFee", () => {
  it("applies 1% between min and max", () => {
    expect(computeCustomerDepositFee(500, "USD")).toBe(5)
    expect(computeCustomerDepositFee(500, "EUR")).toBe(5)
  })

  it("enforces min $3", () => {
    expect(computeCustomerDepositFee(100, "USD")).toBe(3)
    expect(computeCustomerDepositFee(50, "USD")).toBe(3)
  })

  it("enforces max $10", () => {
    expect(computeCustomerDepositFee(1000, "USD")).toBe(10)
    expect(computeCustomerDepositFee(5000, "USD")).toBe(10)
  })
})

describe("computeEasnerMarginFromOmnibus", () => {
  it("$100 ACH with ~$2 channel fee", () => {
    const r = computeEasnerMarginFromOmnibus({
      fiatAmount: 100,
      currency: "USD",
      noahChannelFee: 2,
      omnibusRemaining: 98,
    })
    expect(r.customerFee).toBe(3)
    expect(r.userNet).toBe(97)
    expect(r.easnerMargin).toBe(1)
    expect(isDepositSplitEconomicsValid(r)).toBe(true)
  })

  it("$1000 at max fee", () => {
    const r = computeEasnerMarginFromOmnibus({
      fiatAmount: 1000,
      currency: "USD",
      noahChannelFee: 2,
      omnibusRemaining: 998,
    })
    expect(r.customerFee).toBe(10)
    expect(r.userNet).toBe(990)
    expect(r.easnerMargin).toBe(8)
  })

  it("flags negative margin when channel exceeds customer fee", () => {
    const r = computeEasnerMarginFromOmnibus({
      fiatAmount: 250,
      currency: "USD",
      noahChannelFee: 5,
      omnibusRemaining: 245,
    })
    expect(r.customerFee).toBe(3)
    expect(r.easnerMargin).toBe(-2)
    expect(isDepositSplitEconomicsValid(r)).toBe(false)
  })
})

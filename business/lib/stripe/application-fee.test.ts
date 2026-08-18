import { describe, expect, it, vi } from "vitest"
import { computeCheckoutAmounts } from "./application-fee"

vi.mock("./config", () => ({
  getStripePlatformFeeBps: () => 0,
}))

describe("computeCheckoutAmounts", () => {
  it("merchant net: customer pays the listed amount and processing comes off the top", () => {
    const amounts = computeCheckoutAmounts({ listedAmountCents: 10_000, feeMode: "merchant_net" })

    expect(amounts.customerAmountCents).toBe(10_000)
    expect(amounts.surchargeCents).toBe(0)
    expect(amounts.processingEstimateCents).toBe(320)
    expect(amounts.applicationFeeCents).toBe(320)
    expect(amounts.merchantNetCents).toBe(9_680)
  })

  it("buyer surcharge: merchant nets at least the listed amount", () => {
    const amounts = computeCheckoutAmounts({ listedAmountCents: 10_000, feeMode: "buyer_surcharge" })

    expect(amounts.customerAmountCents).toBeGreaterThan(10_000)
    expect(amounts.surchargeCents).toBe(amounts.customerAmountCents - 10_000)
    expect(amounts.applicationFeeCents).toBe(amounts.surchargeCents)
    expect(amounts.merchantNetCents).toBeGreaterThanOrEqual(10_000)
  })

  it("easner absorbs: no platform fee, merchant receives the full listed amount", () => {
    const amounts = computeCheckoutAmounts({ listedAmountCents: 10_000, feeMode: "easner_absorbs" })

    expect(amounts.customerAmountCents).toBe(10_000)
    expect(amounts.applicationFeeCents).toBe(0)
    expect(amounts.applicationFeePercent).toBe(0)
    expect(amounts.merchantNetCents).toBe(10_000)
  })

  it("keeps the application fee within the charge for tiny amounts", () => {
    const amounts = computeCheckoutAmounts({ listedAmountCents: 50, feeMode: "merchant_net" })

    expect(amounts.applicationFeeCents).toBeLessThanOrEqual(amounts.customerAmountCents)
    expect(amounts.merchantNetCents).toBeGreaterThanOrEqual(0)
  })

  it("treats non-positive amounts as zero", () => {
    const amounts = computeCheckoutAmounts({ listedAmountCents: 0, feeMode: "buyer_surcharge" })

    expect(amounts.customerAmountCents).toBe(0)
    expect(amounts.applicationFeeCents).toBe(0)
    expect(amounts.merchantNetCents).toBe(0)
  })

  it("expresses the subscription fee as a percent of the customer charge", () => {
    const amounts = computeCheckoutAmounts({ listedAmountCents: 10_000, feeMode: "merchant_net" })

    expect(amounts.applicationFeePercent).toBeCloseTo(3.2, 1)
  })
})

import { describe, expect, it } from "vitest"
import {
  expressDepositsPayerCountry,
  expressDepositsSourceCurrency,
  isStripeOnrampPayerEligible,
  stripeOnrampAchAvailable,
} from "./stripe-onramp-geo"

describe("isStripeOnrampPayerEligible", () => {
  it("allows US except NY", () => {
    expect(isStripeOnrampPayerEligible({ country: "US", state: "CA" })).toBe(true)
    expect(isStripeOnrampPayerEligible({ country: "us", state: "ny" })).toBe(false)
    expect(isStripeOnrampPayerEligible({ country: "US" })).toBe(true)
  })

  it("hides GB even when EU is enabled", () => {
    expect(isStripeOnrampPayerEligible({ country: "GB", euEnabled: true })).toBe(false)
  })

  it("includes EU-27 by default; NG stays out", () => {
    expect(isStripeOnrampPayerEligible({ country: "DE" })).toBe(true)
    expect(isStripeOnrampPayerEligible({ country: "DE", euEnabled: false })).toBe(false)
    expect(isStripeOnrampPayerEligible({ country: "NG" })).toBe(false)
  })
})

describe("expressDepositsSourceCurrency", () => {
  it("is usd for US and eur for EU-27", () => {
    expect(expressDepositsSourceCurrency("US")).toBe("usd")
    expect(expressDepositsSourceCurrency("DE")).toBe("eur")
    expect(expressDepositsSourceCurrency("NG")).toBeNull()
  })
})

describe("expressDepositsPayerCountry", () => {
  it("prefers residence over KYC address country", () => {
    expect(
      expressDepositsPayerCountry({
        residenceCountry: "DE",
        kycAddressCountry: "US",
      }),
    ).toBe("DE")
    expect(
      expressDepositsPayerCountry({
        residenceCountry: null,
        kycAddressCountry: "fr",
      }),
    ).toBe("FR")
  })
})

describe("stripeOnrampAchAvailable", () => {
  it("is US-only", () => {
    expect(stripeOnrampAchAvailable({ country: "US", state: "TX" })).toBe(true)
    expect(stripeOnrampAchAvailable({ country: "DE", euEnabled: true })).toBe(false)
    expect(stripeOnrampAchAvailable({ country: "US", state: "NY" })).toBe(false)
  })
})

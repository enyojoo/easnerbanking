import { describe, expect, it } from "vitest"
import {
  hasPayoutCrossCurrencyFx,
  isPayoutReviewFeeVisible,
  shouldShowPayoutExchangeFee,
  shouldShowPayoutProcessingFee,
  shouldShowPayoutNetworkFee,
} from "./payout-review-display"

describe("payout-review-display", () => {
  it("treats dust amounts as not visible", () => {
    expect(isPayoutReviewFeeVisible(0)).toBe(false)
    expect(isPayoutReviewFeeVisible(0.005)).toBe(false)
    expect(isPayoutReviewFeeVisible(0.006)).toBe(true)
  })

  it("shows exchange fee only for cross-currency with a fee", () => {
    expect(
      shouldShowPayoutExchangeFee({
        sendCurrency: "USD",
        receiveCurrency: "NGN",
        exchangeFee: 0.32,
      }),
    ).toBe(true)
    expect(
      shouldShowPayoutExchangeFee({
        sendCurrency: "USD",
        receiveCurrency: "USD",
        exchangeFee: 0.32,
      }),
    ).toBe(false)
    expect(
      shouldShowPayoutExchangeFee({
        sendCurrency: "USD",
        receiveCurrency: "NGN",
        exchangeFee: 0,
      }),
    ).toBe(false)
  })

  it("shows processing and network fees when positive", () => {
    expect(shouldShowPayoutProcessingFee(2)).toBe(true)
    expect(shouldShowPayoutProcessingFee(0)).toBe(false)
    expect(shouldShowPayoutNetworkFee(0.01)).toBe(true)
    expect(shouldShowPayoutNetworkFee(null)).toBe(false)
  })

  it("detects cross-currency FX", () => {
    expect(hasPayoutCrossCurrencyFx("USD", "EUR")).toBe(true)
    expect(hasPayoutCrossCurrencyFx("usd", "USD")).toBe(false)
  })
})

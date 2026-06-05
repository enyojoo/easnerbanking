import { describe, expect, it } from "vitest"
import {
  hasPayoutCrossCurrencyFx,
  hasWalletSendFxDisplay,
  isPayoutReviewFeeVisible,
  shouldShowGlobalPayoutProcessingFee,
  shouldShowPayoutExchangeFee,
  shouldShowPayoutProcessingFee,
  shouldShowPayoutReviewProcessingFee,
  shouldShowWalletSendProcessingFee,
  shouldShowWalletSendNetworkFee,
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

  it("hides wallet send processing fee for LI.FI bridge (margin in customer rate)", () => {
    expect(
      shouldShowWalletSendProcessingFee({ executionModel: "lifi_bridge", processingFee: 1.5 }),
    ).toBe(false)
    expect(
      shouldShowWalletSendProcessingFee({ executionModel: "direct_turnkey", processingFee: 1 }),
    ).toBe(true)
  })

  it("hides global fiat processing fee (margin in noah_rates.rate)", () => {
    expect(shouldShowGlobalPayoutProcessingFee({ processingFee: 0.056 })).toBe(false)
    expect(
      shouldShowPayoutReviewProcessingFee({
        payoutFlow: "global_fiat",
        processingFee: 0.056,
      }),
    ).toBe(false)
    expect(
      shouldShowPayoutReviewProcessingFee({
        payoutFlow: "wallet_send",
        executionModel: "direct_turnkey",
        processingFee: 1,
      }),
    ).toBe(true)
    expect(
      shouldShowPayoutReviewProcessingFee({
        payoutFlow: "wallet_send",
        executionModel: "lifi_bridge",
        processingFee: 1.5,
      }),
    ).toBe(false)
  })

  it("hides wallet send network fee for both execution models", () => {
    expect(
      shouldShowWalletSendNetworkFee({ executionModel: "lifi_bridge", networkFee: 0.5 }),
    ).toBe(false)
    expect(
      shouldShowWalletSendNetworkFee({ executionModel: "direct_turnkey", networkFee: 0.5 }),
    ).toBe(false)
    expect(shouldShowWalletSendNetworkFee({ networkFee: 0.5 })).toBe(true)
  })

  it("detects cross-currency FX", () => {
    expect(hasPayoutCrossCurrencyFx("USD", "EUR")).toBe(true)
    expect(hasPayoutCrossCurrencyFx("usd", "USD")).toBe(false)
    expect(hasPayoutCrossCurrencyFx("USD", "USDC")).toBe(true)
  })

  it("hides wallet send FX for direct Turnkey Solana stables", () => {
    expect(hasWalletSendFxDisplay("USD", "USDC", "Solana")).toBe(false)
    expect(hasWalletSendFxDisplay("EUR", "EURC", "Solana")).toBe(false)
    expect(hasWalletSendFxDisplay("USD", "USDC", "Ethereum")).toBe(true)
  })
})

import { describe, expect, it } from "vitest"
import {
  hasPayoutCrossCurrencyFx,
  hasWalletSendFxDisplay,
  isPayoutReviewFeeVisible,
  pickVisibleProcessingFee,
  shouldShowGlobalPayoutProcessingFee,
  shouldShowPayoutExchangeFee,
  shouldShowPayoutProcessingFee,
  shouldShowPayoutReviewFeeRow,
  shouldShowPayoutReviewProcessingFee,
  shouldShowWalletSendProcessingFee,
  shouldShowWalletSendNetworkFee,
  shouldShowPayoutNetworkFee,
} from "./payout-review-display"

describe("payout-review-display", () => {
  it("shows a $0 processing fee and still hides dust", () => {
    expect(isPayoutReviewFeeVisible(0)).toBe(true)
    expect(isPayoutReviewFeeVisible(0.005)).toBe(false)
    expect(isPayoutReviewFeeVisible(0.006)).toBe(true)
    expect(isPayoutReviewFeeVisible(null)).toBe(false)
    expect(pickVisibleProcessingFee(undefined, 0)).toBe(0)
    expect(shouldShowPayoutReviewFeeRow({ processingFee: 0 })).toBe(true)
    expect(shouldShowPayoutReviewFeeRow({})).toBe(false)
    expect(shouldShowPayoutReviewFeeRow({ processingFee: null, exchangeFee: null })).toBe(false)
  })

  it("never shows a standalone exchange fee row (folded into Processing fee)", () => {
    expect(
      shouldShowPayoutExchangeFee({
        sendCurrency: "USD",
        receiveCurrency: "NGN",
        exchangeFee: 0.32,
      }),
    ).toBe(false)
    expect(
      shouldShowPayoutExchangeFee({
        sendCurrency: "USD",
        receiveCurrency: "USD",
        exchangeFee: 0.32,
      }),
    ).toBe(false)
  })

  it("shows processing and network fees when positive", () => {
    expect(shouldShowPayoutProcessingFee(2)).toBe(true)
    expect(shouldShowPayoutProcessingFee(0)).toBe(true)
    expect(shouldShowPayoutNetworkFee(0.01)).toBe(true)
    expect(shouldShowPayoutNetworkFee(null)).toBe(false)
  })

  it("shows the combined Processing fee for LI.FI bridge (explicit 1% leg now visible)", () => {
    expect(
      shouldShowWalletSendProcessingFee({ executionModel: "relay_bridge", processingFee: 1.5 }),
    ).toBe(true)
    expect(
      shouldShowWalletSendProcessingFee({ executionModel: "direct_turnkey", processingFee: 1 }),
    ).toBe(true)
    // Channel-only cost (no explicit leg) still surfaces in the combined row.
    expect(
      shouldShowWalletSendProcessingFee({ executionModel: "relay_bridge", exchangeFee: 0.8 }),
    ).toBe(true)
  })

  it("shows global fiat processing fee (explicit 1% + channel cost)", () => {
    expect(shouldShowGlobalPayoutProcessingFee({ processingFee: 0.056 })).toBe(true)
    expect(
      shouldShowPayoutReviewProcessingFee({
        payoutFlow: "global_fiat",
        processingFee: 0.056,
      }),
    ).toBe(true)
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
        executionModel: "relay_bridge",
        processingFee: 1.5,
      }),
    ).toBe(true)
  })

  it("hides wallet send network fee for both execution models", () => {
    expect(
      shouldShowWalletSendNetworkFee({ executionModel: "relay_bridge", networkFee: 0.5 }),
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

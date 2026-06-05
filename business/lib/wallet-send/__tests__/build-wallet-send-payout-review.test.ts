import { describe, expect, it } from "vitest"
import {
  buildWalletSendPayoutReviewSnapshot,
  resolveWalletSendPayoutReview,
} from "../build-wallet-send-payout-review"

describe("buildWalletSendPayoutReviewSnapshot", () => {
  it("builds direct Turnkey review rows", () => {
    const review = buildWalletSendPayoutReviewSnapshot({
      session: {
        receive_amount: 100,
        receive_asset: "USDC",
        receive_network: "Solana",
        source_balance_currency: "USD",
        total_debited: 101,
        margin_amount: 1,
        customer_rate: 1,
        execution_model: "direct_turnkey",
        lifi_floor: 100,
        lifi_mid: 1,
      },
    })
    expect(review.you_send_amount).toBe(100)
    expect(review.processing_fee).toBe(1)
    expect(review.total_debited).toBe(101)
    expect(review.exchange_fee).toBe(0)
    expect(review.execution_model).toBe("direct_turnkey")
    expect(review.transfer_method).toBe("USDC on Solana")
  })

  it("builds LI.FI review rows that add up", () => {
    const review = buildWalletSendPayoutReviewSnapshot({
      session: {
        receive_amount: 100,
        receive_asset: "USDT",
        receive_network: "Tron",
        source_balance_currency: "USD",
        total_debited: 104.52,
        margin_amount: 1.52,
        customer_rate: 0.985,
        execution_model: "lifi_bridge",
        lifi_floor: 103,
        lifi_mid: 1,
      },
      channelCost: 3,
    })
    expect(review.you_send_amount + review.exchange_fee).toBeCloseTo(review.total_debited, 2)
    expect(review.execution_model).toBe("lifi_bridge")
  })
})

describe("resolveWalletSendPayoutReview", () => {
  it("reads nested payout_review", () => {
    const review = resolveWalletSendPayoutReview(
      {
        payout_review: {
          you_send_amount: 100,
          total_debited: 101,
          exchange_fee: 0,
          processing_fee: 1,
          exchange_rate: 1,
          send_currency: "USD",
          receive_amount: 100,
          receive_currency: "USDC",
          transfer_method: "USDC on Solana",
          processing_time: "",
          execution_model: "direct_turnkey",
        },
      },
      101,
      "USD",
    )
    expect(review?.total_debited).toBe(101)
    expect(review?.execution_model).toBe("direct_turnkey")
  })

  it("reconstructs legacy flat wallet_send metadata", () => {
    const review = resolveWalletSendPayoutReview(
      {
        activity_type: "wallet_send",
        receive_amount: 100,
        receive_asset: "USDT",
        receive_network: "Tron",
        customer_rate: 0.985,
        you_send_amount: 101.52,
        exchange_fee: 3,
        total_debited: 104.52,
        margin_amount: 1.52,
        execution_model: "lifi_bridge",
      },
      104.52,
      "USD",
    )
    expect(review?.you_send_amount).toBe(101.52)
    expect(review?.exchange_fee).toBe(3)
    expect(review?.total_debited).toBe(104.52)
    expect(review?.execution_model).toBe("lifi_bridge")
  })

  it("infers direct Turnkey when execution_model missing", () => {
    const review = resolveWalletSendPayoutReview(
      {
        activity_type: "wallet_send",
        receive_amount: 50,
        receive_asset: "EURC",
        receive_network: "Solana",
        total_debited: 50.5,
        margin_amount: 0.5,
      },
      50.5,
      "EUR",
    )
    expect(review?.execution_model).toBe("direct_turnkey")
  })
})

import { describe, expect, it } from "vitest"
import { rawPayoutReviewFromMetadata } from "./payout-review-from-metadata"

describe("rawPayoutReviewFromMetadata", () => {
  it("prefers payout_review over review_snapshot", () => {
    expect(
      rawPayoutReviewFromMetadata({
        payout_review: { receive_amount: 10 },
        review_snapshot: { receive_amount: 1 },
      }),
    ).toEqual({ receive_amount: 10 })
  })

  it("falls back to review_snapshot", () => {
    expect(rawPayoutReviewFromMetadata({ review_snapshot: { receive_amount: 2 } })).toEqual({
      receive_amount: 2,
    })
  })

  it("overlays Grid executed send and total onto a stale Office payout_review", () => {
    expect(
      rawPayoutReviewFromMetadata({
        payout_provider: "grid",
        grid_mode: "balance_payout",
        crypto_authorized_amount: "1.502259",
        noah_send_amount: "1.502259",
        total_debited: 1.523926,
        processing_fee: 0.014445,
        margin_amount: 0.007222,
        channel_cost: 0.057787,
        customer_rate: 1331.32,
        payout_review: {
          you_send_amount: 1.444472,
          total_debited: 1.466139,
          processing_fee: 0.014445,
          exchange_fee: 0.007222,
          receive_amount: 2000,
          receive_currency: "NGN",
          send_currency: "USD",
        },
      }),
    ).toEqual(
      expect.objectContaining({
        you_send_amount: 1.502259,
        noah_send_amount: 1.502259,
        total_debited: 1.523926,
        processing_fee: 0.014445,
        receive_amount: 2000,
        exchange_rate: 1331.32,
      }),
    )
  })
})

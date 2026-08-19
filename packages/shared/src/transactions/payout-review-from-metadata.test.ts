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
})

import { describe, expect, it } from "vitest"
import { normalizePayoutReviewSnapshot } from "./build-payout-execute-snapshot"

describe("normalizePayoutReviewSnapshot", () => {
  it("preserves display_processing_fee_local for cross-border pay-in", () => {
    const review = normalizePayoutReviewSnapshot({
      you_send_amount: 94606.3,
      total_debited: 94606.3,
      receive_amount: 988500,
      receive_currency: "NGN",
      send_currency: "KES",
      transfer_method: "Local Transfer",
      exchange_rate: 10.715354715212,
      processing_fee: 7.207657,
      exchange_fee: 14.8,
      processing_time: "Within minutes",
      display_processing_fee_local: 2830.91,
    })

    expect(review?.display_processing_fee_local).toBe(2830.91)
  })
})

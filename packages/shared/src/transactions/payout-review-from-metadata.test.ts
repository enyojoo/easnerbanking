import { describe, expect, it } from "vitest"
import {
  payoutReviewRailOpsFields,
  rawPayoutReviewFromMetadata,
  relabelYcPayoutMetadataForPresentation,
} from "./payout-review-from-metadata"

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

  it("relabels Noah aliases on Yellowcard payout_review", () => {
    const review = rawPayoutReviewFromMetadata({
      payout_provider: "yellowcard",
      yc_mode: "balance_payout",
      crypto_authorized_amount: "1.485",
      noah_send_amount: "1.485",
      noah_floor: "1.485",
      payout_review: {
        you_send_amount: 1.475,
        total_debited: 1.5,
        noah_send_amount: 1.485,
        noah_floor: 1.485,
        receive_amount: 2000,
      },
    }) as Record<string, unknown>
    expect(review.you_send_amount).toBe(1.475)
    expect(review.yc_send_amount).toBe(1.485)
    expect(review.yc_floor).toBe(1.485)
    expect(review.noah_send_amount).toBeUndefined()
  })
})

describe("payoutReviewRailOpsFields", () => {
  it("writes yc_send_amount for Yellowcard and omits Noah schedule aliases", () => {
    expect(
      payoutReviewRailOpsFields({
        payoutProvider: "yellowcard",
        cryptoSendAmount: 1.485,
        scheduleFee: 0.01,
      }),
    ).toEqual({ yc_send_amount: 1.485, yc_floor: 1.485 })
  })
})

describe("relabelYcPayoutMetadataForPresentation", () => {
  it("strips Noah send aliases from YC metadata presentation", () => {
    const relabeled = relabelYcPayoutMetadataForPresentation({
      payout_provider: "yellowcard",
      yc_mode: "balance_payout",
      crypto_authorized_amount: "1.485",
      noah_send_amount: "1.485",
      noah_floor: "1.485",
      payout_review: { noah_send_amount: 1.485, you_send_amount: 1.475 },
    })
    expect(relabeled.yc_send_amount).toBe(1.485)
    expect(relabeled.noah_send_amount).toBeUndefined()
    expect(relabeled.noah_floor).toBeUndefined()
    expect((relabeled.payout_review as Record<string, unknown>).yc_send_amount).toBe(1.485)
    expect((relabeled.payout_review as Record<string, unknown>).noah_send_amount).toBeUndefined()
  })
})


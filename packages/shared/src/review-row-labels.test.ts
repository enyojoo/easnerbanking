import { describe, expect, it } from "vitest"
import {
  REVIEW_ROW_LABELS,
  reviewPrimaryAmountLabel,
  shouldShowReviewTotalDebited,
} from "./review-row-labels"

describe("review-row-labels", () => {
  it("uses Amount paid on settled local pay-in detail", () => {
    expect(reviewPrimaryAmountLabel("local_pay_in", "detail")).toBe(
      REVIEW_ROW_LABELS.amountPaid,
    )
  })

  it("uses Amount to pay for local pay-in confirm", () => {
    expect(reviewPrimaryAmountLabel("local_pay_in", "confirm")).toBe(
      REVIEW_ROW_LABELS.amountToPay,
    )
  })

  it("uses Sending / Sent for balance payouts", () => {
    expect(reviewPrimaryAmountLabel("balance_payout", "confirm")).toBe(
      REVIEW_ROW_LABELS.sending,
    )
    expect(reviewPrimaryAmountLabel("balance_payout", "detail")).toBe(REVIEW_ROW_LABELS.sent)
  })

  it("hides Total debited for local pay-in", () => {
    expect(shouldShowReviewTotalDebited("local_pay_in")).toBe(false)
    expect(shouldShowReviewTotalDebited("balance_payout")).toBe(true)
  })
})

import { describe, expect, it } from "vitest"
import {
  REVIEW_ROW_LABELS,
  reviewPrimaryAmountLabel,
  shouldShowReviewTotalDebited,
  resolvePayoutReviewFlow,
  formatAccountBalanceLabel,
} from "./review-row-labels"

describe("review-row-labels", () => {
  it("uses Total to pay for local pay-in confirm", () => {
    expect(reviewPrimaryAmountLabel("local_pay_in", "confirm")).toBe(
      REVIEW_ROW_LABELS.totalToPay,
    )
  })

  it("uses Amount paid on settled local pay-in detail", () => {
    expect(reviewPrimaryAmountLabel("local_pay_in", "detail")).toBe(
      REVIEW_ROW_LABELS.amountPaid,
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

  it("resolves YC cross-border send as local pay-in", () => {
    expect(resolvePayoutReviewFlow({ yc_mode: "cross_border_send" })).toBe("local_pay_in")
    expect(resolvePayoutReviewFlow({ payout_type: "global_fiat" })).toBe("balance_payout")
  })

  it("formats account balance labels", () => {
    expect(formatAccountBalanceLabel("usd")).toBe("USD Balance")
  })
})

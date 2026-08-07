import { describe, expect, it } from "vitest"
import { REVIEW_ROW_LABELS } from "./review-row-labels"
import {
  formatReviewRowMoneyDisplay,
  formatSignedMoneyDisplay,
  resolveReviewRowMoneySign,
} from "./format-review-row-money"

describe("format-review-row-money", () => {
  it("resolves credit and debit labels", () => {
    expect(resolveReviewRowMoneySign(REVIEW_ROW_LABELS.amountCredited)).toBe("credit")
    expect(resolveReviewRowMoneySign(REVIEW_ROW_LABELS.amountToCredit)).toBeNull()
    expect(resolveReviewRowMoneySign(REVIEW_ROW_LABELS.processingFee)).toBeNull()
    expect(resolveReviewRowMoneySign(REVIEW_ROW_LABELS.totalDebited)).toBe("debit")
    expect(resolveReviewRowMoneySign(REVIEW_ROW_LABELS.amountToPay)).toBeNull()
    expect(resolveReviewRowMoneySign(REVIEW_ROW_LABELS.sent)).toBeNull()
    expect(resolveReviewRowMoneySign(REVIEW_ROW_LABELS.sending)).toBeNull()
    expect(resolveReviewRowMoneySign(REVIEW_ROW_LABELS.recipient)).toBeNull()
    expect(resolveReviewRowMoneySign(REVIEW_ROW_LABELS.exchangeRate)).toBeNull()
  })

  it("prefixes + and − on formatted money", () => {
    expect(formatSignedMoneyDisplay(9.95, "USD", "credit")).toBe("+$9.95")
    expect(formatSignedMoneyDisplay(3.32, "USD", "debit")).toBe("-$3.32")
    expect(formatSignedMoneyDisplay(100000, "NGN", "debit")).toBe("-₦100,000")
  })

  it("formats by review row label", () => {
    expect(formatReviewRowMoneyDisplay(REVIEW_ROW_LABELS.amountCredited, 65, "USD")).toBe("+$65")
    expect(formatReviewRowMoneyDisplay(REVIEW_ROW_LABELS.processingFee, 0.65, "USD")).toBe("$0.65")
    expect(formatReviewRowMoneyDisplay(REVIEW_ROW_LABELS.depositMethod, 0, "USD")).toBe("$0")
  })
})

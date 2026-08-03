/**
 * Signed money values for transaction review / detail rows.
 * Only debit and credit totals — not fees, Sending amount/Sent amount, or Recipient amount.
 */

import { formatMoneyDisplay } from "./format-money-display"
import { REVIEW_ROW_LABELS } from "./review-row-labels"

export type ReviewRowMoneySign = "credit" | "debit"

const CREDIT_ROW_LABELS: ReadonlySet<string> = new Set([
  REVIEW_ROW_LABELS.amountCredited,
])

const DEBIT_ROW_LABELS: ReadonlySet<string> = new Set([
  REVIEW_ROW_LABELS.totalDebited,
])

/** Whether a review row value should show + (credit) or − (debit). */
export function resolveReviewRowMoneySign(label: string): ReviewRowMoneySign | null {
  if (CREDIT_ROW_LABELS.has(label)) return "credit"
  if (DEBIT_ROW_LABELS.has(label)) return "debit"
  return null
}

/** Prefix +/− before formatted money (matches mobile hero signed amounts). */
export function formatSignedMoneyDisplay(
  amount: number,
  currency: string,
  sign: ReviewRowMoneySign,
): string {
  const prefix = sign === "credit" ? "+" : "-"
  return `${prefix}${formatMoneyDisplay(Math.abs(amount), currency)}`
}

/** Format a review-row money value with the correct sign for its label. */
export function formatReviewRowMoneyDisplay(
  label: string,
  amount: number,
  currency: string,
): string {
  const sign = resolveReviewRowMoneySign(label)
  if (!sign) return formatMoneyDisplay(amount, currency)
  return formatSignedMoneyDisplay(amount, currency, sign)
}

/**
 * Canonical review / detail row labels for payout, deposit, and pay-in flows.
 * Keep in-app review, transaction detail, and email rows aligned.
 */

export const REVIEW_ROW_LABELS = {
  transactionId: "Transaction ID",
  /** Balance outbound (confirm). */
  sending: "Sending",
  /** Balance outbound (settled detail / email). */
  sent: "Sent",
  totalDebited: "Total debited",
  recipientGets: "Recipient gets",
  recipient: "Recipient",
  /** External rail pay-in (local deposit + YC cross-border send). */
  amountToPay: "Amount to pay",
  /** Settled local pay-in (transaction detail). */
  amountPaid: "Amount paid",
  /** USD balance credit (live deposit review / complete deposit summary). */
  creditAmount: "Credit amount",
  creditTo: "Credit to",
  /** Verification microdeposits — settled detail only (not spendable balance). */
  creditFor: "Credit for",
  /** Settled inbound bank / stablecoin deposit (detail / email). */
  amountCredited: "Amount credited",
  processingFee: "Processing fee",
  exchangeRate: "Exchange rate",
  transferMethod: "Transfer method",
  arrival: "Arrival",
  from: "From",
  when: "When",
  note: "Note",
  scheme: "Scheme",
  sender: "Sender",
  narration: "Narration",
  /** Cross-border pay-in completion (non fund-balance). */
  paymentAmount: "Payment amount",
} as const

export type ReviewRowLabel = (typeof REVIEW_ROW_LABELS)[keyof typeof REVIEW_ROW_LABELS]

export type ReviewFlowKind = "balance_payout" | "local_pay_in"
export type ReviewPhase = "confirm" | "detail"

/** Primary outbound / pay-in amount row (Sending vs Amount to pay). */
export function reviewPrimaryAmountLabel(
  flow: ReviewFlowKind,
  phase: ReviewPhase,
): string {
  if (flow === "local_pay_in") {
    return phase === "detail" ? REVIEW_ROW_LABELS.amountPaid : REVIEW_ROW_LABELS.amountToPay
  }
  return phase === "confirm" ? REVIEW_ROW_LABELS.sending : REVIEW_ROW_LABELS.sent
}

/** Whether the review card should show Total debited (balance payouts only). */
export function shouldShowReviewTotalDebited(flow: ReviewFlowKind): boolean {
  return flow === "balance_payout"
}

/**
 * Canonical review / detail row labels for payout, deposit, and pay-in flows.
 * Keep in-app review, transaction detail, and email rows aligned.
 */

/** Cross-border Through Local Currency — review, complete, and detail transfer-method row. */
export const TLC_LOCAL_TRANSFER_METHOD = "Local Transfer"

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
  /** Local principal at quoted rate before processing fees (YC fund balance pay-in). */
  depositAmount: "Deposit amount",
  /** Local principal for cross-border send pay-in (TLC bank / MoMo). */
  transferAmount: "Transfer amount",
  /** All-in local pay-in including fees (YC fund balance confirm). */
  totalToPay: "Total to pay",
  /** Settled local pay-in (transaction detail). */
  amountPaid: "Amount paid",
  /** USD balance credit (live deposit review — mirrors Amount to pay). */
  amountToCredit: "Amount to credit",
  /** Review estimate before YC quote lock. */
  estimatedToPay: "Estimated to pay",
  estimatedToCredit: "Estimated to credit",
  creditTo: "Credited to",
  /** Verification microdeposits — settled detail only (not spendable balance). */
  creditFor: "Credit for",
  /** Settled inbound bank / stablecoin deposit (detail / email). */
  amountCredited: "Amount credited",
  processingFee: "Processing fee",
  exchangeRate: "Exchange rate",
  transferMethod: "Transfer method",
  arrival: "Arrival",
  /** Balance outbound — source account (confirm / detail / email). */
  debitedFrom: "Debited from",
  when: "When",
  note: "Note",
  scheme: "Scheme",
  sender: "Sender",
  narration: "Narration",
  /** Cross-border pay-in completion (non fund-balance). */
  paymentAmount: "Payment amount",
  mobileNumber: "Mobile number",
  paymentNetwork: "Network",
  /** Fund-balance MoMo deposit review — phone / network prompts. */
  momoNumberPrompt: "Enter your MOMO number",
  momoNetworkPrompt: "Select MOMO Network",
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
    return phase === "detail" ? REVIEW_ROW_LABELS.amountPaid : REVIEW_ROW_LABELS.totalToPay
  }
  return phase === "confirm" ? REVIEW_ROW_LABELS.sending : REVIEW_ROW_LABELS.sent
}

/** Whether the review card should show Total debited (balance payouts only). */
export function shouldShowReviewTotalDebited(flow: ReviewFlowKind): boolean {
  return flow === "balance_payout"
}

/** Balance debit vs local pay-in (YC cross-border send). */
export function resolvePayoutReviewFlow(
  metadata: Record<string, unknown> | null | undefined,
): ReviewFlowKind {
  if (metadata && String(metadata.yc_mode ?? "") === "cross_border_send") {
    return "local_pay_in"
  }
  return "balance_payout"
}

/** e.g. USD → "USD Balance" */
export function formatAccountBalanceLabel(currency: string): string {
  const c = String(currency ?? "").trim().toUpperCase()
  return c ? `${c} Balance` : "Balance"
}

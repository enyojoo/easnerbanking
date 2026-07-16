/**
 * Canonical transaction detail rows for settled/failed/reversed emails — the same
 * Sending / Processing fee / Total debited / Recipient / Transfer method (payout) and
 * Scheme / Sender / Processing fee / Amount credited (deposit) rows shown in-app.
 *
 * Hidden ops fields (margin_amount, channel_cost) are never emitted. The displayed
 * "Processing fee" is the combined `computeDisplayProcessingFee` value so the email
 * foots the same way as the in-app views: Total debited = Sending + Processing fee.
 */

import { formatMoneyDisplay } from "../format-money-display"
import { formatReviewRowMoneyDisplay } from "../format-review-row-money"
import { formatSendRateLabel } from "../format-exchange-rate"
import { formatPayoutRecipientSubtitle } from "../payout-recipient-subtitle"
import { computeDisplayProcessingFee } from "../payout-processing-fee"
import type { ReviewFlowKind } from "../review-row-labels"
import { REVIEW_ROW_LABELS, formatAccountBalanceLabel, shouldShowReviewTotalDebited } from "../review-row-labels"
import {
  hasPayoutCrossCurrencyFx,
  hasWalletSendFxDisplay,
  isPayoutReviewFeeVisible,
} from "../payout-review-display"
import { normalizeTransferMethodLabel } from "./payout-transfer-method"
import type { GlobalPayoutReviewSnapshot } from "./global-payout-types"
import type { YcFundBalanceDepositReviewSnapshot } from "./global-deposit-types"
import type { InboundReceiveDetailSnapshot } from "./inbound-receive-detail"
import { buildInboundReceiveEmailDetailRows } from "./inbound-receive-detail"

export type TransactionEmailDetailRow = { label: string; value: string }

export type TransactionEmailDetailInput = {
  direction: "in" | "out" | null
  payoutReview?: GlobalPayoutReviewSnapshot | null
  /** Wallet-send receive network (e.g. "SOL") — hides the Exchange rate row for 1:1 stablecoin parity. */
  receiveNetwork?: string | null
  /** Recipient snapshot for payout rows (bank/mobile/wallet subtitle). */
  recipient?: {
    fullName?: string | null
    bankName?: string | null
    accountNumber?: string | null
    phone?: string | null
    mobileProvider?: string | null
    walletNetwork?: string | null
  } | null
  /** Deposit (credit) enrichment fields. */
  deposit?: {
    scheme?: string | null
    senderDisplay?: string | null
    feeAmount?: number | null
    feeCurrency?: string | null
    postedAmount?: number | null
    postedCurrency?: string | null
    narration?: string | null
  } | null
  depositReview?: YcFundBalanceDepositReviewSnapshot | null
  /** Unified inbound receive snapshot (YC, Noah VA, verification, stablecoin, Easetag). */
  inboundReceive?: InboundReceiveDetailSnapshot | null
  /** Balance debit vs local pay-in (YC cross-border send). */
  payoutReviewFlow?: ReviewFlowKind
}

function pushIf(
  rows: TransactionEmailDetailRow[],
  label: string,
  value: string | null | undefined,
): void {
  const v = String(value ?? "").trim()
  if (v) rows.push({ label, value: v })
}

function buildPayoutRows(review: GlobalPayoutReviewSnapshot, input: TransactionEmailDetailInput): TransactionEmailDetailRow[] {
  const rows: TransactionEmailDetailRow[] = []
  const sendCurrency = review.send_currency
  const displayProcessingFee = computeDisplayProcessingFee({
    processingFee: review.processing_fee,
    exchangeFee: review.exchange_fee,
  })
  const receiveNetwork = String(input.receiveNetwork || "").trim()
  const hasFx = receiveNetwork
    ? hasWalletSendFxDisplay(review.send_currency, review.receive_currency, receiveNetwork)
    : hasPayoutCrossCurrencyFx(review.send_currency, review.receive_currency)

  // Emails describe what has happened (a detail view), so use the past-tense "Sent".
  pushIf(rows, REVIEW_ROW_LABELS.sent, formatMoneyDisplay(review.you_send_amount, sendCurrency))
  const reviewFlow = input.payoutReviewFlow ?? "balance_payout"
  if (shouldShowReviewTotalDebited(reviewFlow)) {
    pushIf(
      rows,
      REVIEW_ROW_LABELS.debitedFrom,
      formatAccountBalanceLabel(sendCurrency),
    )
  }
  if (isPayoutReviewFeeVisible(displayProcessingFee)) {
    pushIf(
      rows,
      REVIEW_ROW_LABELS.processingFee,
      formatReviewRowMoneyDisplay(
        REVIEW_ROW_LABELS.processingFee,
        displayProcessingFee,
        sendCurrency,
      ),
    )
  }
  if (hasFx) {
    pushIf(
      rows,
      REVIEW_ROW_LABELS.exchangeRate,
      formatSendRateLabel(review.send_currency, review.receive_currency, review.exchange_rate),
    )
  }
  pushIf(
    rows,
    REVIEW_ROW_LABELS.totalDebited,
    formatReviewRowMoneyDisplay(REVIEW_ROW_LABELS.totalDebited, review.total_debited, sendCurrency),
  )
  pushIf(
    rows,
    REVIEW_ROW_LABELS.recipientGets,
    formatMoneyDisplay(review.receive_amount, review.receive_currency),
  )

  const recipient = input.recipient
  if (recipient?.fullName) {
    const subtitle = formatPayoutRecipientSubtitle({
      bankName: recipient.bankName ?? undefined,
      accountNumber: recipient.accountNumber ?? undefined,
      fullAccountNumber: recipient.accountNumber ?? undefined,
      phone: recipient.phone ?? undefined,
      mobileProvider: recipient.mobileProvider ?? undefined,
      walletNetwork: recipient.walletNetwork ?? undefined,
    })
    pushIf(rows, REVIEW_ROW_LABELS.recipient, subtitle ? `${recipient.fullName} (${subtitle})` : recipient.fullName)
  }

  pushIf(rows, REVIEW_ROW_LABELS.transferMethod, normalizeTransferMethodLabel(review.transfer_method))
  return rows
}

function buildDepositRows(deposit: NonNullable<TransactionEmailDetailInput["deposit"]>): TransactionEmailDetailRow[] {
  const rows: TransactionEmailDetailRow[] = []
  pushIf(rows, REVIEW_ROW_LABELS.scheme, deposit.scheme)
  pushIf(rows, REVIEW_ROW_LABELS.sender, deposit.senderDisplay)
  if (deposit.feeAmount != null && deposit.feeAmount > 0) {
    pushIf(
      rows,
      REVIEW_ROW_LABELS.processingFee,
      formatReviewRowMoneyDisplay(
        REVIEW_ROW_LABELS.processingFee,
        deposit.feeAmount,
        deposit.feeCurrency || "USD",
      ),
    )
  }
  if (deposit.postedAmount != null && deposit.postedAmount > 0) {
    const postedCurrency = deposit.postedCurrency || "USD"
    pushIf(
      rows,
      REVIEW_ROW_LABELS.amountCredited,
      formatReviewRowMoneyDisplay(
        REVIEW_ROW_LABELS.amountCredited,
        deposit.postedAmount,
        postedCurrency,
      ),
    )
    pushIf(rows, REVIEW_ROW_LABELS.creditTo, `${postedCurrency.toUpperCase()} Balance`)
  }
  pushIf(rows, REVIEW_ROW_LABELS.narration, deposit.narration)
  return rows
}

function buildYcFundBalanceDepositRows(
  review: YcFundBalanceDepositReviewSnapshot,
): TransactionEmailDetailRow[] {
  const rows: TransactionEmailDetailRow[] = []
  const displayProcessingFee = computeDisplayProcessingFee({
    processingFee: review.processing_fee,
    exchangeFee: review.exchange_fee,
  })
  pushIf(
    rows,
    REVIEW_ROW_LABELS.amountPaid,
    formatReviewRowMoneyDisplay(
      REVIEW_ROW_LABELS.amountPaid,
      review.local_pay_in,
      review.local_currency,
    ),
  )
  if (isPayoutReviewFeeVisible(displayProcessingFee)) {
    pushIf(
      rows,
      REVIEW_ROW_LABELS.processingFee,
      formatReviewRowMoneyDisplay(REVIEW_ROW_LABELS.processingFee, displayProcessingFee, "USD"),
    )
  }
  if (review.exchange_rate > 0) {
    pushIf(
      rows,
      REVIEW_ROW_LABELS.exchangeRate,
      formatSendRateLabel("USD", review.local_currency, review.exchange_rate),
    )
  }
  pushIf(
    rows,
    REVIEW_ROW_LABELS.amountCredited,
    formatReviewRowMoneyDisplay(REVIEW_ROW_LABELS.amountCredited, review.usd_credit, "USD"),
  )
  pushIf(rows, REVIEW_ROW_LABELS.creditTo, review.credit_to)
  pushIf(rows, REVIEW_ROW_LABELS.scheme, review.transfer_method)
  return rows
}

/**
 * Canonical email detail rows (excluding Transaction ID / Status / Date, which the template owns).
 * Returns `[]` for shapes without enrichment (e.g. Easetag, which has no Processing fee row).
 */
export function buildTransactionEmailDetailRows(
  input: TransactionEmailDetailInput,
): TransactionEmailDetailRow[] {
  if (input.inboundReceive) return buildInboundReceiveEmailDetailRows(input.inboundReceive)
  if (input.payoutReview) return buildPayoutRows(input.payoutReview, input)
  if (input.depositReview) return buildYcFundBalanceDepositRows(input.depositReview)
  if (input.direction === "in" && input.deposit) return buildDepositRows(input.deposit)
  return []
}

/** Row labels omitted from downloadable receipts (mobile image + business PDF). */
const RECEIPT_OMITTED_ROW_LABELS: ReadonlySet<string> = new Set([
  REVIEW_ROW_LABELS.exchangeRate,
  REVIEW_ROW_LABELS.transferMethod,
  REVIEW_ROW_LABELS.narration,
])

/** Receipts reuse canonical rows but hide ops-oriented payout fields. */
export function filterTransactionReceiptDetailRows(
  rows: TransactionEmailDetailRow[],
): TransactionEmailDetailRow[] {
  return rows.filter((row) => !RECEIPT_OMITTED_ROW_LABELS.has(row.label))
}

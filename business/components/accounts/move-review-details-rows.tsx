"use client"

import {
  formatMoneyDisplay,
  formatReviewRowMoneyDisplay,
  formatSendRateLabel,
  REVIEW_ROW_LABELS,
  shouldShowPayoutReviewFeeRow,
  type BalanceMoveReviewSnapshot,
} from "@easner/shared"
import { CreditDestinationRow } from "@/components/transactions/credit-destination-row"
import {
  TransactionDetailSummaryRow,
  TRANSACTION_DETAIL_MONEY_VALUE_CLASS,
} from "@/components/transactions/transaction-detail-summary-row"
import { Card, CardContent } from "@/components/ui/card"
import { Copy, Check } from "lucide-react"

type Props = {
  transactionId?: string
  moveReview: BalanceMoveReviewSnapshot
  copiedKey?: string | null
  onCopy?: (text: string, key: string) => void
  mode?: "confirm" | "detail"
}

export function MoveReviewDetailsRows({
  transactionId,
  moveReview,
  copiedKey,
  onCopy,
  mode = "detail",
}: Props) {
  const primaryLabel =
    mode === "detail" ? REVIEW_ROW_LABELS.sent : REVIEW_ROW_LABELS.sending
  const creditLabel =
    mode === "detail" ? REVIEW_ROW_LABELS.amountCredited : REVIEW_ROW_LABELS.amountToCredit
  const showProcessingFee = shouldShowPayoutReviewFeeRow({
    processingFee: moveReview.processing_fee,
    exchangeFee: 0,
  })

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-6">
        {transactionId ? (
          <TransactionDetailSummaryRow label={REVIEW_ROW_LABELS.transactionId}>
            {onCopy ? (
              <button
                type="button"
                className="flex items-center gap-2 font-mono text-sm font-normal transition-colors hover:text-primary"
                onClick={() => onCopy(transactionId, "transactionId")}
                aria-label="Copy transaction id"
              >
                {transactionId}
                {copiedKey === "transactionId" ? (
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <Copy className="h-4 w-4 shrink-0" />
                )}
              </button>
            ) : (
              <span className="font-mono text-sm font-normal">{transactionId}</span>
            )}
          </TransactionDetailSummaryRow>
        ) : null}

        <TransactionDetailSummaryRow
          label={primaryLabel}
          value={formatMoneyDisplay(moveReview.source_amount, moveReview.source_currency)}
          valueClassName={TRANSACTION_DETAIL_MONEY_VALUE_CLASS}
        />

        {showProcessingFee ? (
          <TransactionDetailSummaryRow
            label={REVIEW_ROW_LABELS.processingFee}
            value={formatReviewRowMoneyDisplay(
              REVIEW_ROW_LABELS.processingFee,
              moveReview.processing_fee,
              moveReview.source_currency,
            )}
          />
        ) : null}

        <TransactionDetailSummaryRow
          label={REVIEW_ROW_LABELS.exchangeRate}
          value={formatSendRateLabel(
            moveReview.source_currency,
            moveReview.destination_currency,
            moveReview.exchange_rate,
          )}
        />

        <TransactionDetailSummaryRow
          label={REVIEW_ROW_LABELS.totalDebited}
          value={formatReviewRowMoneyDisplay(
            REVIEW_ROW_LABELS.totalDebited,
            moveReview.total_debited,
            moveReview.source_currency,
          )}
          valueClassName={TRANSACTION_DETAIL_MONEY_VALUE_CLASS}
        />

        <CreditDestinationRow
          label={REVIEW_ROW_LABELS.debitedFrom}
          currency={moveReview.source_currency}
          balanceLabel={moveReview.debited_from_label}
        />

        <TransactionDetailSummaryRow
          label={creditLabel}
          value={formatMoneyDisplay(
            moveReview.destination_amount,
            moveReview.destination_currency,
          )}
          valueClassName={TRANSACTION_DETAIL_MONEY_VALUE_CLASS}
        />

        <CreditDestinationRow
          label={REVIEW_ROW_LABELS.creditTo}
          currency={moveReview.destination_currency}
          balanceLabel={moveReview.credited_to_label}
        />
      </CardContent>
    </Card>
  )
}

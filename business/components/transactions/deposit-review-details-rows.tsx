"use client"

import {
  computeDisplayProcessingFee,
  formatAccountBalanceLabel,
  formatReviewRowMoneyDisplay,
  formatSendRateLabel,
  REVIEW_ROW_LABELS,
  reviewPrimaryAmountLabel,
  shouldShowPayoutReviewFeeRow,
  type TransactionTimingRow,
  type YcFundBalanceDepositReviewSnapshot,
} from "@easner/shared"
import { CreditDestinationRow } from "@/components/transactions/credit-destination-row"
import { TransactionDetailSummaryRow } from "@/components/transactions/transaction-detail-summary-row"
import { TransactionTimingRows } from "@/components/transactions/transaction-timing-rows"
import { formatTransactionRowDateTime } from "@/lib/transaction-row-present"
import { Card, CardContent } from "@/components/ui/card"
import { Copy, Check } from "lucide-react"

type Props = {
  transactionId: string
  depositReview: YcFundBalanceDepositReviewSnapshot
  copiedKey?: string | null
  onCopy?: (text: string, key: string) => void
  timingRows?: TransactionTimingRow[] | null
  whenAt?: string | null
  mode?: "confirm" | "detail"
}

export function DepositReviewDetailsRows({
  transactionId,
  depositReview,
  copiedKey,
  onCopy,
  timingRows,
  whenAt,
  mode = "detail",
}: Props) {
  const displayProcessingFee = computeDisplayProcessingFee({
    processingFee: depositReview.processing_fee,
    exchangeFee: depositReview.exchange_fee,
  })
  const feeLocalRaw = depositReview.display_processing_fee_local
  const feeLocal =
    feeLocalRaw != null && Number.isFinite(feeLocalRaw) && feeLocalRaw > 0
      ? feeLocalRaw
      : null
  const feeAmount = feeLocal ?? displayProcessingFee
  const feeCurrency = feeLocal != null ? depositReview.local_currency : "USD"
  const showProcessingFee = shouldShowPayoutReviewFeeRow({
    processingFee: depositReview.processing_fee,
    exchangeFee: depositReview.exchange_fee,
  })
  const hasFx = depositReview.exchange_rate > 0
  const creditLabel =
    mode === "detail" ? REVIEW_ROW_LABELS.amountCredited : REVIEW_ROW_LABELS.amountToCredit

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-6">
        <TransactionDetailSummaryRow label={REVIEW_ROW_LABELS.transactionId}>
          {onCopy ? (
            <button
              type="button"
              className="flex items-center gap-2 font-mono text-sm font-medium transition-colors hover:text-primary"
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
            <span className="font-mono text-sm font-medium">{transactionId}</span>
          )}
        </TransactionDetailSummaryRow>

        <TransactionDetailSummaryRow
          label={reviewPrimaryAmountLabel("local_pay_in", mode)}
          value={formatReviewRowMoneyDisplay(
            reviewPrimaryAmountLabel("local_pay_in", mode),
            depositReview.local_pay_in,
            depositReview.local_currency,
          )}
          valueClassName="text-xl font-semibold"
        />

        {showProcessingFee ? (
          <TransactionDetailSummaryRow
            label={REVIEW_ROW_LABELS.processingFee}
            value={formatReviewRowMoneyDisplay(
              REVIEW_ROW_LABELS.processingFee,
              feeAmount,
              feeCurrency,
            )}
            valueClassName="font-semibold"
          />
        ) : null}

        {hasFx ? (
          <TransactionDetailSummaryRow
            label={REVIEW_ROW_LABELS.exchangeRate}
            value={formatSendRateLabel("USD", depositReview.local_currency, depositReview.exchange_rate)}
            valueClassName="font-semibold"
          />
        ) : null}

        <TransactionDetailSummaryRow
          label={creditLabel}
          value={formatReviewRowMoneyDisplay(creditLabel, depositReview.usd_credit, "USD")}
          valueClassName="text-xl font-semibold"
        />

        <CreditDestinationRow
          label={REVIEW_ROW_LABELS.creditTo}
          currency="USD"
          balanceLabel={depositReview.credit_to || formatAccountBalanceLabel("USD")}
        />

        <TransactionDetailSummaryRow
          label={mode === "detail" ? REVIEW_ROW_LABELS.scheme : REVIEW_ROW_LABELS.transferMethod}
          value={depositReview.transfer_method}
        />

        {whenAt ? (
          <TransactionDetailSummaryRow
            label={REVIEW_ROW_LABELS.when}
            value={formatTransactionRowDateTime(whenAt)}
          />
        ) : null}

        {timingRows?.length ? <TransactionTimingRows rows={timingRows} /> : null}
      </CardContent>
    </Card>
  )
}

"use client"

import {
  computeDisplayProcessingFee,
  CurrencyFlag,
  formatMoneyDisplay,
  formatSendRateLabel,
  REVIEW_ROW_LABELS,
  reviewPrimaryAmountLabel,
  shouldShowPayoutReviewFeeRow,
  type TransactionTimingRow,
  type YcFundBalanceDepositReviewSnapshot,
} from "@easner/shared"
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
  const showProcessingFee = shouldShowPayoutReviewFeeRow({
    processingFee: depositReview.processing_fee,
    exchangeFee: depositReview.exchange_fee,
  })
  const hasFx = depositReview.exchange_rate > 0

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between gap-2 border-b pb-4">
          <span className="text-sm text-muted-foreground">{REVIEW_ROW_LABELS.transactionId}</span>
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
        </div>

        <div className="flex items-center justify-between border-b pb-4">
          <span className="text-sm text-muted-foreground">
            {reviewPrimaryAmountLabel("local_pay_in", mode)}
          </span>
          <span className="text-xl font-semibold">
            {formatMoneyDisplay(depositReview.local_pay_in, depositReview.local_currency)}
          </span>
        </div>

        {showProcessingFee ? (
          <div className="flex items-center justify-between border-b pb-4">
            <span className="text-sm text-muted-foreground">{REVIEW_ROW_LABELS.processingFee}</span>
            <span className="font-semibold">{formatMoneyDisplay(displayProcessingFee, "USD")}</span>
          </div>
        ) : null}

        {hasFx ? (
          <div className="flex items-center justify-between border-b pb-4">
            <span className="text-sm text-muted-foreground">{REVIEW_ROW_LABELS.exchangeRate}</span>
            <span className="font-semibold">
              {formatSendRateLabel("USD", depositReview.local_currency, depositReview.exchange_rate)}
            </span>
          </div>
        ) : null}

        <div className="flex items-center justify-between border-b pb-4">
          <span className="text-sm text-muted-foreground">
            {mode === "detail" ? REVIEW_ROW_LABELS.amountCredited : REVIEW_ROW_LABELS.creditAmount}
          </span>
          <span className="text-xl font-semibold">
            {formatMoneyDisplay(depositReview.usd_credit, "USD")}
          </span>
        </div>

        <div className="flex items-center justify-between border-b pb-4">
          <span className="text-sm text-muted-foreground">{REVIEW_ROW_LABELS.creditTo}</span>
          <div className="flex shrink-0 items-center gap-2 font-medium">
            <CurrencyFlag currency="USD" size={22} className="shrink-0" />
            <span>{depositReview.credit_to}</span>
          </div>
        </div>

        <div className="flex items-center justify-between border-b pb-4">
          <span className="text-sm text-muted-foreground">
            {mode === "detail" ? REVIEW_ROW_LABELS.scheme : REVIEW_ROW_LABELS.transferMethod}
          </span>
          <span className="font-medium">{depositReview.transfer_method}</span>
        </div>

        {whenAt ? (
          <div className="flex items-center justify-between border-b pb-4">
            <span className="text-sm text-muted-foreground">{REVIEW_ROW_LABELS.when}</span>
            <span className="font-medium">{formatTransactionRowDateTime(whenAt)}</span>
          </div>
        ) : null}

        {timingRows?.length ? <TransactionTimingRows rows={timingRows} /> : null}
      </CardContent>
    </Card>
  )
}

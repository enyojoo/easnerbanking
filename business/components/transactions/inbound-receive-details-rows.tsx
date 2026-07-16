"use client"

import {
  REVIEW_ROW_LABELS,
  buildInboundReceiveDetailRows,
  formatAccountBalanceLabel,
  type InboundReceiveDetailSnapshot,
  type TransactionTimingRow,
} from "@easner/shared"
import { CreditDestinationRow } from "@/components/transactions/credit-destination-row"
import { TransactionDetailSummaryRow } from "@/components/transactions/transaction-detail-summary-row"
import { TransactionTimingRows } from "@/components/transactions/transaction-timing-rows"
import { Card, CardContent } from "@/components/ui/card"
import { Copy, Check } from "lucide-react"

type Props = {
  transactionId: string
  snapshot: InboundReceiveDetailSnapshot
  copiedKey?: string | null
  onCopy?: (text: string, key: string) => void
  timingRows?: TransactionTimingRow[] | null
  lifecycleSlot?: React.ReactNode
}

export function InboundReceiveDetailsRows({
  transactionId,
  snapshot,
  copiedKey,
  onCopy,
  timingRows,
  lifecycleSlot,
}: Props) {
  const rows = buildInboundReceiveDetailRows(snapshot, { surface: "detail" })

  return (
    <>
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

          {rows.map((row, index) => {
            if (row.isVerificationHint) {
              return (
                <p key={`hint-${index}`} className="py-2 text-sm text-muted-foreground">
                  {row.value}
                </p>
              )
            }

            const isCreditRow =
              row.label === REVIEW_ROW_LABELS.creditTo || row.label === REVIEW_ROW_LABELS.creditFor
            const creditCurrency = row.creditCurrency ?? snapshot.creditDestination?.currency

            if (isCreditRow && creditCurrency) {
              const balanceLabel =
                row.value ||
                snapshot.creditDestination?.balanceLabel ||
                formatAccountBalanceLabel(creditCurrency)
              return (
                <CreditDestinationRow
                  key={`${row.label}-${index}`}
                  label={row.label}
                  currency={creditCurrency}
                  balanceLabel={balanceLabel}
                />
              )
            }

            return (
              <TransactionDetailSummaryRow
                key={`${row.label}-${index}`}
                label={row.label}
                value={row.value}
                valueClassName={
                  row.label === REVIEW_ROW_LABELS.amountCredited ? "text-xl font-semibold" : undefined
                }
              />
            )
          })}

          {timingRows?.length ? <TransactionTimingRows rows={timingRows} /> : null}
        </CardContent>
      </Card>
      {lifecycleSlot}
    </>
  )
}

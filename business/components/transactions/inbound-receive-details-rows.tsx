"use client"

import {
  CurrencyFlag,
  REVIEW_ROW_LABELS,
  buildInboundReceiveDetailRows,
  type InboundReceiveDetailSnapshot,
  type TransactionTimingRow,
} from "@easner/shared"
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
        <CardContent className="space-y-3 p-6">
          <div className="flex justify-between gap-4 border-b pb-4 text-sm">
            <span className="shrink-0 text-muted-foreground">{REVIEW_ROW_LABELS.transactionId}</span>
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

          {rows.map((row, index) => {
            if (row.isVerificationHint) {
              return (
                <p key={`hint-${index}`} className="text-sm text-muted-foreground">
                  {row.value}
                </p>
              )
            }

            const isCreditRow =
              row.label === REVIEW_ROW_LABELS.creditTo || row.label === REVIEW_ROW_LABELS.creditFor

            if (isCreditRow && row.creditCurrency) {
              return (
                <div key={`${row.label}-${index}`} className="flex items-center justify-between border-b pb-4">
                  <span className="text-sm text-muted-foreground">{row.label}</span>
                  <div className="flex shrink-0 items-center gap-2 font-medium">
                    <CurrencyFlag currency={row.creditCurrency} size={22} className="shrink-0" />
                    <span>{row.value}</span>
                  </div>
                </div>
              )
            }

            return (
              <div key={`${row.label}-${index}`} className="flex justify-between gap-4 border-b pb-4 text-sm">
                <span className="shrink-0 text-muted-foreground">{row.label}</span>
                <span
                  className={
                    row.label === REVIEW_ROW_LABELS.amountCredited
                      ? "text-right text-xl font-semibold"
                      : "text-right font-medium"
                  }
                >
                  {row.value}
                </span>
              </div>
            )
          })}

          {timingRows?.length ? <TransactionTimingRows rows={timingRows} /> : null}
        </CardContent>
      </Card>
      {lifecycleSlot}
    </>
  )
}

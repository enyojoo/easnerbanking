"use client"

import {
  buildYcLocalPayInCompleteRows,
  type YcPayInRail,
} from "@easner/shared"
import { Check, Copy } from "lucide-react"
import { TransactionDetailSummaryRow } from "@/components/transactions/transaction-detail-summary-row"

export type YcLocalPayInCompleteSummaryProps = {
  flowMode: "fund_balance" | "cross_border_send"
  transactionId: string
  localPayIn: number
  localCurrency: string
  creditOrReceiveAmount: number
  creditOrReceiveCurrency: string
  customerRate: number
  processingFeeLocal?: number
  processingFeeUsd?: number
  exchangeFeeUsd?: number
  provisionalPayIn?: number
  payInRail: YcPayInRail
  recipientName?: string
  copiedField?: string | null
  onCopy?: (text: string, field: string) => void
}

export function YcLocalPayInCompleteSummary({
  flowMode,
  transactionId,
  localPayIn,
  localCurrency,
  creditOrReceiveAmount,
  creditOrReceiveCurrency,
  customerRate,
  processingFeeLocal,
  processingFeeUsd,
  exchangeFeeUsd,
  provisionalPayIn,
  payInRail,
  recipientName,
  copiedField,
  onCopy,
}: YcLocalPayInCompleteSummaryProps) {
  const rows = buildYcLocalPayInCompleteRows({
    mode: flowMode,
    rail: payInRail,
    transactionId,
    payInCurrency: localCurrency,
    receiveCurrency: creditOrReceiveCurrency,
    localPayIn,
    receiveAmount: creditOrReceiveAmount,
    customerRate,
    processingFeeLocal,
    processingFeeUsd,
    exchangeFeeUsd,
    recipientName,
  })

  return (
    <>
      {rows.map((row) => {
        if (row.id === "transaction-id" && onCopy) {
          return (
            <div
              key={row.id}
              className={`flex justify-between items-center gap-4 py-2 ${
                row.id !== "transfer-method" ? "border-b" : ""
              }`}
            >
              <span className="text-muted-foreground">{row.label}</span>
              <button
                type="button"
                onClick={() => void onCopy(transactionId.toUpperCase(), "yc-complete-txid")}
                className="flex items-center gap-2 font-mono text-sm hover:text-primary transition-colors text-right"
              >
                <span className="break-all">{row.value}</span>
                {copiedField === "yc-complete-txid" ? (
                  <Check className="h-4 w-4 text-primary shrink-0" />
                ) : (
                  <Copy className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </button>
            </div>
          )
        }
        return (
          <div
            key={row.id}
            className={`flex justify-between gap-4 py-2 ${
              row.id !== "transfer-method" ? "border-b" : ""
            }`}
          >
            <span className="text-muted-foreground">{row.label}</span>
            <span className={row.valueBold ? "font-semibold" : ""}>{row.value}</span>
          </div>
        )
      })}
    </>
  )
}

/** Plan alias — web complete pay-in panel summary rows. */
export { YcLocalPayInCompleteSummary as YcLocalPayInComplete }

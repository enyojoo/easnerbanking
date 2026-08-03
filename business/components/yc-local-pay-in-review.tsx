"use client"

import type { ReactNode } from "react"
import {
  buildYcLocalPayInReviewRows,
  REVIEW_ROW_LABELS,
  type YcPayInRail,
  type YcLocalPayInReviewMode,
  type YcLocalPayInReviewPhase,
} from "@easner/shared"
import { Check, Copy } from "lucide-react"
import { TransactionDetailSummaryRow } from "@/components/transactions/transaction-detail-summary-row"

export type YcLocalPayInReviewProps = {
  mode: YcLocalPayInReviewMode
  phase: YcLocalPayInReviewPhase
  rail: YcPayInRail
  payInCurrency: string
  receiveCurrency: string
  customerRate: number
  localPayIn: number
  receiveAmount: number
  requestedReceiveAmount?: number
  processingFeeLocal?: number
  processingFeeUsd?: number
  exchangeFeeUsd?: number
  principalLocal?: number
  usdCredit?: number
  transactionId?: string
  processingTime?: string
  recipientNode?: ReactNode
  creditDestinationNode?: ReactNode
  footer?: ReactNode
  quoteHint?: ReactNode
  copiedField?: string | null
  onCopy?: (text: string, field: string) => void
}

/** Shared TLC + fund-balance pay-in review rows for web. */
export function YcLocalPayInReview({
  mode,
  phase,
  rail,
  payInCurrency,
  receiveCurrency,
  customerRate,
  localPayIn,
  receiveAmount,
  requestedReceiveAmount,
  processingFeeLocal,
  processingFeeUsd,
  exchangeFeeUsd,
  principalLocal,
  usdCredit,
  transactionId,
  processingTime,
  recipientNode,
  creditDestinationNode,
  footer,
  quoteHint,
  copiedField,
  onCopy,
}: YcLocalPayInReviewProps) {
  const rows = buildYcLocalPayInReviewRows({
    mode,
    phase,
    rail,
    payInCurrency,
    receiveCurrency,
    customerRate,
    localPayIn,
    receiveAmount,
    requestedReceiveAmount,
    processingFeeLocal,
    processingFeeUsd,
    exchangeFeeUsd,
    principalLocal,
    usdCredit,
    transactionId,
    processingTime,
  })

  return (
    <div className="rounded-xl bg-card p-4 space-y-1 text-sm">
      {rows.map((row) => {
        if (row.id === "transaction-id" && onCopy && transactionId) {
          return (
            <div key={row.id} className="flex justify-between items-center gap-4 border-b border-border py-2 text-sm">
              <span className="shrink-0 text-muted-foreground">{row.label}</span>
              <button
                type="button"
                onClick={() => void onCopy(transactionId.toUpperCase(), "yc-review-txid")}
                className="flex items-center gap-2 font-mono text-sm hover:text-primary transition-colors text-right"
              >
                <span className="break-all">{row.value}</span>
                {copiedField === "yc-review-txid" ? (
                  <Check className="h-4 w-4 text-primary shrink-0" />
                ) : (
                  <Copy className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </button>
            </div>
          )
        }
        if (row.id === "recipient-gets" && mode === "cross_border_send") {
          return (
            <div key={row.id}>
              <TransactionDetailSummaryRow
                label={row.label}
                value={row.value}
                valueClassName={row.valueBold ? "font-semibold" : undefined}
              />
              <TransactionDetailSummaryRow label={REVIEW_ROW_LABELS.recipient}>
                {recipientNode}
              </TransactionDetailSummaryRow>
            </div>
          )
        }
        if (row.id === "amount-to-credit" && creditDestinationNode) {
          return (
            <div key={row.id}>
              <TransactionDetailSummaryRow
                label={row.label}
                value={row.value}
                valueClassName={row.valueBold ? "font-semibold" : undefined}
              />
              {creditDestinationNode}
            </div>
          )
        }
        return (
          <TransactionDetailSummaryRow
            key={row.id}
            label={row.label}
            value={row.value}
            valueClassName={
              row.valueBold ? "font-semibold" : row.valueMono ? "font-mono" : undefined
            }
          />
        )
      })}
      {quoteHint}
      {footer}
    </div>
  )
}

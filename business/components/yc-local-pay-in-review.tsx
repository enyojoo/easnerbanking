"use client"

import type { ReactNode } from "react"
import {
  buildYcLocalPayInReviewRows,
  REVIEW_ROW_LABELS,
  type YcPayInRail,
  type YcLocalPayInReviewMode,
  type YcLocalPayInReviewPhase,
} from "@easner/shared"
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
    processingFeeLocal,
    processingFeeUsd,
    exchangeFeeUsd,
    principalLocal,
    usdCredit,
    transactionId,
    processingTime,
  })

  return (
    <div className="rounded-xl border border-border p-4 space-y-1 text-sm">
      {rows.map((row) => {
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

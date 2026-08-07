"use client"

import type { ReactNode } from "react"
import {
  buildCrossBorderSendDetailRows,
  formatPayoutRecipientSubtitle,
  type GlobalPayoutRecipientSnapshot,
  type GlobalPayoutReviewSnapshot,
} from "@easner/shared"
import {
  TransactionDetailSummaryRow,
  TRANSACTION_DETAIL_MONEY_VALUE_CLASS,
} from "@/components/transactions/transaction-detail-summary-row"
import { formatTransactionRowDateTime } from "@/lib/transaction-row-present"

type Props = {
  payoutReview: GlobalPayoutReviewSnapshot
  recipientSnapshot?: GlobalPayoutRecipientSnapshot | null
  displayProcessingFee: number
  whenAt?: string | null
  recipientNode?: ReactNode
}

export function CrossBorderSendDetailRows({
  payoutReview,
  recipientSnapshot,
  displayProcessingFee,
  whenAt,
  recipientNode,
}: Props) {
  const whenLabel = whenAt ? formatTransactionRowDateTime(whenAt) : "—"
  const rows = buildCrossBorderSendDetailRows({
    payoutReview,
    recipientSnapshot,
    whenLabel,
    displayProcessingFee,
  })

  return (
    <>
      {rows.map((row) => {
        if (row.id === "recipient" && (recipientNode || recipientSnapshot)) {
          if (recipientNode) {
            return (
              <TransactionDetailSummaryRow key={row.id} label={row.label}>
                {recipientNode}
              </TransactionDetailSummaryRow>
            )
          }
          const subtitle = formatPayoutRecipientSubtitle({
            bankName: recipientSnapshot.bank_name,
            phone: recipientSnapshot.phone,
            mobileProvider: recipientSnapshot.mobile_provider,
            accountNumber: recipientSnapshot.account_number,
            fullAccountNumber: recipientSnapshot.account_number,
          })
          return (
            <TransactionDetailSummaryRow key={row.id} label={row.label}>
              <div className="min-w-0 max-w-[70%] shrink-0 text-right">
                <p className="font-normal">{recipientSnapshot.full_name}</p>
                {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
              </div>
            </TransactionDetailSummaryRow>
          )
        }
        return (
          <TransactionDetailSummaryRow
            key={row.id}
            label={row.label}
            value={row.value}
            valueClassName={row.valueBold ? TRANSACTION_DETAIL_MONEY_VALUE_CLASS : undefined}
          />
        )
      })}
    </>
  )
}

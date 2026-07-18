import React from 'react'
import {
  buildYcLocalPayInCompleteRows,
  resolveYcCrossBorderLocalPayInBreakdownForDisplay,
  type YcPayInRail,
} from '@easner/shared'
import {
  TransactionDetailSummaryRow,
  TransactionDetailCopyableValue,
} from '../transactions/TransactionDetailSummaryRow'

export type YcLocalPayInCompleteSummaryProps = {
  mode: 'fund_balance' | 'cross_border_send'
  rail: YcPayInRail
  transactionId: string
  payInCurrency: string
  receiveCurrency: string
  localPayIn: number
  receiveAmount: number
  customerRate: number
  processingFeeLocal?: number
  processingFeeUsd?: number
  exchangeFeeUsd?: number
  provisionalPayIn?: number
  recipientName?: string
  copiedKey?: string | null
  onCopyTransactionId?: (text: string) => void
}

/** Renders locked pay-in complete summary rows (fund-balance + TLC). */
export function YcLocalPayInCompleteSummary({
  mode,
  rail,
  transactionId,
  payInCurrency,
  receiveCurrency,
  localPayIn,
  receiveAmount,
  customerRate,
  processingFeeLocal,
  processingFeeUsd,
  exchangeFeeUsd,
  provisionalPayIn,
  recipientName,
  copiedKey,
  onCopyTransactionId,
}: YcLocalPayInCompleteSummaryProps) {
  const isCrossBorder = mode === 'cross_border_send'
  const isMomo = rail === 'mobile_money'
  const crossBorderBreakdown =
    isCrossBorder && isMomo && customerRate > 0 && localPayIn > 0
      ? resolveYcCrossBorderLocalPayInBreakdownForDisplay({
          localPayIn,
          payInCurrency,
          receiveAmount,
          customerRate,
          provisionalPayIn,
          displayProcessingFeeLocal: processingFeeLocal,
        })
      : null
  const principalLocal = crossBorderBreakdown?.principalLocal

  const rows = buildYcLocalPayInCompleteRows({
    mode,
    rail,
    transactionId,
    payInCurrency,
    receiveCurrency,
    localPayIn,
    receiveAmount,
    customerRate,
    processingFeeLocal:
      crossBorderBreakdown?.feeLocal ?? processingFeeLocal,
    processingFeeUsd,
    exchangeFeeUsd,
    principalLocal,
    recipientName,
  })

  return (
    <>
      {rows.map((row, index) => {
        const isLast = index === rows.length - 1
        if (row.id === 'transaction-id' && onCopyTransactionId) {
          return (
            <TransactionDetailSummaryRow key={row.id} label={row.label} last={isLast}>
              <TransactionDetailCopyableValue
                value={row.value}
                copied={copiedKey === 'transactionId'}
                onPress={() => onCopyTransactionId(row.value)}
                mono
              />
            </TransactionDetailSummaryRow>
          )
        }
        return (
          <TransactionDetailSummaryRow
            key={row.id}
            label={row.label}
            value={row.value}
            valueBold={row.valueBold}
            valueMono={row.valueMono}
            last={isLast}
          />
        )
      })}
    </>
  )
}

/** Plan alias — complete pay-in summary shell. */
export const YcLocalPayInComplete = YcLocalPayInCompleteSummary

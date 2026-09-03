import React, { type ReactNode } from 'react'
import { Text, StyleSheet } from 'react-native'
import { PostHogMaskView } from 'posthog-react-native'
import {
  buildCrossBorderSendDetailRows,
  formatPayoutRecipientSubtitle,
  type GlobalPayoutRecipientSnapshot,
  type GlobalPayoutReviewSnapshot,
} from '@easner/shared'
import {
  TransactionDetailSummaryRow,
  transactionDetailRowStyles,
} from './TransactionDetailSummaryRow'
import { colors } from '../../theme'

type Props = {
  payoutReview: GlobalPayoutReviewSnapshot
  recipientSnapshot?: GlobalPayoutRecipientSnapshot | null
  displayProcessingFee: number
  whenTs: string
  formatTimestamp: (ts: string) => string
  recipientNode?: ReactNode
}

export function CrossBorderSendDetailRows({
  payoutReview,
  recipientSnapshot,
  displayProcessingFee,
  whenTs,
  formatTimestamp,
  recipientNode,
}: Props) {
  const rows = buildCrossBorderSendDetailRows({
    payoutReview,
    recipientSnapshot,
    whenLabel: formatTimestamp(whenTs),
    displayProcessingFee,
  })

  return (
    <>
      {rows.map((row, index) => {
        if (row.id === 'recipient' && (recipientNode || recipientSnapshot)) {
          if (recipientNode) {
            return (
              <TransactionDetailSummaryRow
                key={row.id}
                label={row.label}
                last={index === rows.length - 1}
              >
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
            <TransactionDetailSummaryRow
              key={row.id}
              label={row.label}
              last={index === rows.length - 1}
            >
              <PostHogMaskView style={styles.valueStack}>
                <Text style={styles.valuePrimary}>{recipientSnapshot.full_name}</Text>
                {subtitle ? <Text style={styles.valueSecondary}>{subtitle}</Text> : null}
              </PostHogMaskView>
            </TransactionDetailSummaryRow>
          )
        }
        return (
          <TransactionDetailSummaryRow
            key={row.id}
            label={row.label}
            value={row.value}
            valueBold={row.valueBold}
            last={index === rows.length - 1}
          />
        )
      })}
    </>
  )
}

const styles = StyleSheet.create({
  valueStack: {
    flex: 1,
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  valuePrimary: {
    ...transactionDetailRowStyles.value,
    flex: 0,
  },
  valueSecondary: {
    ...transactionDetailRowStyles.value,
    fontSize: 13,
    color: colors.text.secondary,
    flex: 0,
  },
})

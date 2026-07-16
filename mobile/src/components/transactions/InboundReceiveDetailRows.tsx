import React from 'react'
import { Text, StyleSheet } from 'react-native'
import {
  REVIEW_ROW_LABELS,
  buildInboundReceiveDetailRows,
  formatAccountBalanceLabel,
  type InboundReceiveDetailSnapshot,
} from '@easner/shared'
import { CreditDestinationRow } from './CreditDestinationRow'
import { TransactionDetailSummaryRow } from './TransactionDetailSummaryRow'
import { colors, spacing, textStyles } from '../../theme'

type Props = {
  snapshot: InboundReceiveDetailSnapshot
}

export function InboundReceiveDetailRows({ snapshot }: Props) {
  const rows = buildInboundReceiveDetailRows(snapshot, { surface: 'detail' })

  return (
    <>
      {rows.map((row, index) => {
        if (row.isVerificationHint) {
          return (
            <Text key={`hint-${index}`} style={styles.hint}>
              {row.value}
            </Text>
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
            valueBold={row.label === REVIEW_ROW_LABELS.amountCredited}
          />
        )
      })}
    </>
  )
}

const styles = StyleSheet.create({
  hint: {
    ...textStyles.caption,
    color: colors.text.secondary,
    paddingVertical: spacing[2],
  },
})

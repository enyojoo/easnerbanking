import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import {
  REVIEW_ROW_LABELS,
  buildInboundReceiveDetailRows,
  type InboundReceiveDetailSnapshot,
} from '@easner/shared'
import { CreditDestinationRow } from './CreditDestinationRow'
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
          return (
            <CreditDestinationRow
              key={`${row.label}-${index}`}
              label={row.label}
              currency={creditCurrency}
              balanceLabel={row.value}
            />
          )
        }

        return (
          <View key={`${row.label}-${index}`} style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{row.label}</Text>
            <Text
              style={[
                styles.summaryValue,
                row.label === REVIEW_ROW_LABELS.amountCredited && styles.summaryValueBold,
              ]}
            >
              {row.value}
            </Text>
          </View>
        )
      })}
    </>
  )
}

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing[3],
    paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.light,
  },
  summaryLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
    flex: 1,
  },
  summaryValue: {
    ...textStyles.titleSmall,
    color: colors.text.primary,
    textAlign: 'right',
  },
  summaryValueBold: {
    fontWeight: '700',
  },
  hint: {
    ...textStyles.caption,
    color: colors.text.secondary,
    paddingVertical: spacing[2],
  },
})

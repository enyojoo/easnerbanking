import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import {
  CurrencyFlag,
  REVIEW_ROW_LABELS,
  buildInboundReceiveDetailRows,
  type InboundReceiveDetailSnapshot,
} from '@easner/shared'
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

        if (isCreditRow && row.creditCurrency) {
          return (
            <View key={`${row.label}-${index}`} style={styles.creditRow}>
              <Text style={styles.summaryLabel}>{row.label}</Text>
              <View style={styles.creditValue}>
                <CurrencyFlag currency={row.creditCurrency} size={20} />
                <Text style={styles.summaryValue}>{row.value}</Text>
              </View>
            </View>
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
  creditRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.light,
  },
  creditValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flex: 1,
    justifyContent: 'flex-end',
  },
  summaryLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
    flex: 1,
  },
  summaryValue: {
    ...textStyles.titleSmall,
    color: colors.text.primary,
    flex: 1,
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

import React from 'react'
import { View, Text, StyleSheet, type TextStyle } from 'react-native'
import { CurrencyFlag } from '../flags/CurrencyFlag'
import { colors, spacing, textStyles } from '../../theme'

type Props = {
  label: string
  currency: string
  balanceLabel: string
  flagSize?: number
  valueStyle?: TextStyle
}

/** Credit to / Credit for row — same layout as YcFundBalanceReview (Expo web, iOS, Android). */
export function CreditDestinationRow({
  label,
  currency,
  balanceLabel,
  flagSize = 20,
  valueStyle,
}: Props) {
  return (
    <View style={styles.creditRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.creditValue}>
        <CurrencyFlag currency={currency} size={flagSize} />
        <Text style={[styles.rowValue, valueStyle]}>{balanceLabel}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
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
  rowLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
    flex: 1,
  },
  rowValue: {
    ...textStyles.body,
    textAlign: 'right',
    flex: 0,
  },
})

import React from 'react'
import { View, Text, StyleSheet, type TextStyle } from 'react-native'
import { CurrencyFlagCircle } from '../flags/CurrencyFlagCircle'
import { colors, spacing, textStyles, fontFamily } from '../../theme'

type Props = {
  label: string
  currency: string
  balanceLabel: string
  flagSize?: number
  valueStyle?: TextStyle
}

/** Credit to / Credit for row — circular flag + balance label (payout review parity). */
export function CreditDestinationRow({
  label,
  currency,
  balanceLabel,
  flagSize = 22,
  valueStyle,
}: Props) {
  return (
    <View style={styles.creditRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.creditValue}>
        <CurrencyFlagCircle currency={currency} size={flagSize} />
        <Text style={[styles.rowValue, valueStyle]} numberOfLines={1}>
          {balanceLabel}
        </Text>
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
    flexShrink: 0,
    maxWidth: '72%',
    justifyContent: 'flex-end',
  },
  rowLabel: {
    ...textStyles.caption,
    color: colors.text.secondary,
    flexShrink: 1,
  },
  rowValue: {
    ...textStyles.body,
    flexShrink: 1,
    fontFamily: fontFamily.semibold,
  },
})

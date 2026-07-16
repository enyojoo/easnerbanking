import React from 'react'
import { View, Text, StyleSheet, type TextStyle } from 'react-native'
import { CurrencyFlagCircle } from '../flags/CurrencyFlagCircle'
import { transactionDetailRowStyles } from './TransactionDetailSummaryRow'
import { fontFamily } from '../../theme'

type Props = {
  label: string
  currency: string
  balanceLabel: string
  flagSize?: number
  valueStyle?: TextStyle
}

/** Credited to / Credit for row — circular flag + balance label (payout review parity). */
export function CreditDestinationRow({
  label,
  currency,
  balanceLabel,
  flagSize = 22,
  valueStyle,
}: Props) {
  return (
    <View style={[transactionDetailRowStyles.row, styles.creditRow]}>
      <Text style={transactionDetailRowStyles.label}>{label}</Text>
      <View style={styles.creditValue}>
        <CurrencyFlagCircle currency={currency} size={flagSize} />
        <Text
          style={[transactionDetailRowStyles.value, styles.creditValueText, valueStyle]}
          numberOfLines={1}
        >
          {balanceLabel}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  creditRow: {
    alignItems: 'center',
  },
  creditValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    maxWidth: '72%',
    justifyContent: 'flex-end',
    flex: 1,
    marginLeft: 8,
  },
  creditValueText: {
    flex: 0,
    flexShrink: 1,
    fontFamily: fontFamily.semibold,
  },
})

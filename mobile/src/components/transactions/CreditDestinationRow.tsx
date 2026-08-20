import React from 'react'
import { View, Text, StyleSheet, type TextStyle } from 'react-native'
import { CurrencyFlagCircle } from '../flags/CurrencyFlagCircle'
import { transactionDetailRowStyles } from './TransactionDetailSummaryRow'
import { colors, spacing, textStyles } from '../../theme'

type Props = {
  label: string
  currency: string
  balanceLabel: string
  flagSize?: number
  valueStyle?: TextStyle
}

/** Credited to / Debited from row – circular flag + balance label (payout review parity). */
export function CreditDestinationRow({
  label,
  currency,
  balanceLabel,
  flagSize = 22,
  valueStyle,
}: Props) {
  const resolvedBalanceLabel =
    String(balanceLabel ?? '').trim() ||
    (currency ? `${String(currency).trim().toUpperCase()} Balance` : 'Balance')

  return (
    <View style={[transactionDetailRowStyles.row, styles.creditRow]}>
      <Text style={transactionDetailRowStyles.label}>{label}</Text>
      <View style={styles.creditValue}>
        <CurrencyFlagCircle currency={currency} size={flagSize} />
        <Text style={[styles.balanceLabel, valueStyle]} numberOfLines={1}>
          {resolvedBalanceLabel}
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
    gap: spacing[2],
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '72%',
    justifyContent: 'flex-end',
  },
  balanceLabel: {
    ...textStyles.body,
    color: colors.text.primary,
    flexShrink: 1,
    textAlign: 'right',
  },
})

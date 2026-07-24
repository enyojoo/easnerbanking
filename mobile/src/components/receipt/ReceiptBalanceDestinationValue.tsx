import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { CurrencyFlagCircle } from '../flags/CurrencyFlagCircle'
import { transactionDetailRowStyles } from '../transactions/TransactionDetailSummaryRow'
import { spacing, textStyles, fontFamily } from '../../theme'

type Props = {
  currency: string
  balanceLabel: string
  flagSize?: number
}

/** Balance chip for receipt rows — flag trailing on the right, matching detail CreditDestinationRow. */
export function ReceiptBalanceDestinationValue({
  currency,
  balanceLabel,
  flagSize = 20,
}: Props) {
  return (
    <View style={styles.wrap}>
      <CurrencyFlagCircle currency={currency} size={flagSize} />
      <Text style={styles.balanceLabel} numberOfLines={1}>
        {balanceLabel}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    justifyContent: 'flex-end',
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '72%',
  },
  balanceLabel: {
    ...transactionDetailRowStyles.value,
    ...textStyles.body,
    fontFamily: fontFamily.semibold,
    flexShrink: 1,
    textAlign: 'right',
  },
})

import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { CurrencyFlagCircle } from '../flags/CurrencyFlagCircle'
import { colors, spacing, textStyles, fontFamily } from '../../theme'

type Props = {
  currency: string
  balanceLabel: string
  flagSize?: number
}

/** Balance chip for receipt rows — matches transaction detail CreditDestinationRow spacing. */
export function ReceiptBalanceDestinationValue({
  currency,
  balanceLabel,
  flagSize = 22,
}: Props) {
  return (
    <View style={styles.creditValue}>
      <CurrencyFlagCircle currency={currency} size={flagSize} />
      <Text style={styles.balanceLabel} numberOfLines={1}>
        {balanceLabel}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
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
    fontFamily: fontFamily.semibold,
    flexShrink: 1,
    textAlign: 'right',
  },
})

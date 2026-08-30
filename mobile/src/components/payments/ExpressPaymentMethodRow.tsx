import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import type { ExpressPaymentMethodDisplay } from '@easner/shared'
import { transactionDetailRowStyles } from '../transactions/TransactionDetailSummaryRow'
import { PaymentMethodBrandIcon } from './PaymentMethodBrandIcon'

type Props = {
  display: ExpressPaymentMethodDisplay
}

/** Brand chip on the left, last4 or wallet name on the right — matches business StripePaymentMethodRow. */
export function ExpressPaymentMethodRow({ display }: Props) {
  return (
    <View
      style={styles.row}
      accessibilityRole="text"
      accessibilityLabel={display.accessibilityLabel}
    >
      <PaymentMethodBrandIcon iconKey={display.iconKey} />
      {display.text ? (
        <Text style={transactionDetailRowStyles.value} numberOfLines={1}>
          {display.text}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    flexShrink: 1,
  },
})

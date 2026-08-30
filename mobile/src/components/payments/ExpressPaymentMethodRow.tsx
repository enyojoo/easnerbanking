import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import type { ExpressPaymentMethodDisplay } from '@easner/shared'
import { PaymentMethodBrandIcon } from './PaymentMethodBrandIcon'
import { colors, fontFamily, textStyles } from '../../theme'

type Props = {
  display: ExpressPaymentMethodDisplay
}

/** Brand chip beside mask or wallet name — compact inline, not stretched across the row. */
export function ExpressPaymentMethodRow({ display }: Props) {
  const walletTitle =
    display.iconKey === 'apple' ||
    display.iconKey === 'google' ||
    display.iconKey === 'apple_pay' ||
    display.iconKey === 'google_pay'
  return (
    <View
      style={styles.row}
      accessibilityRole="text"
      accessibilityLabel={display.accessibilityLabel}
    >
      <PaymentMethodBrandIcon iconKey={display.iconKey} />
      {display.text ? (
        <Text style={[styles.text, walletTitle && styles.textWallet]} numberOfLines={1}>
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
    flexShrink: 1,
    maxWidth: '100%',
  },
  text: {
    ...textStyles.body,
    color: colors.text.primary,
    flexShrink: 1,
    fontFamily: fontFamily.mono,
    fontWeight: '500',
  },
  textWallet: {
    fontFamily: fontFamily.regular,
    fontWeight: '400',
  },
})

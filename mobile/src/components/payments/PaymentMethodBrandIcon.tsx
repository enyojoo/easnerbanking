import React from 'react'
import { Image, StyleSheet, View } from 'react-native'
import { CreditCard } from 'lucide-react-native'
import type { ExpressPaymentBrandIconKey } from '@easner/shared'
import { colors } from '../../theme'

const BRAND_SOURCES: Partial<Record<ExpressPaymentBrandIconKey, number>> = {
  visa: require('../../../assets/payment-brands/visa.png'),
  mastercard: require('../../../assets/payment-brands/mastercard.png'),
  amex: require('../../../assets/payment-brands/amex.png'),
  discover: require('../../../assets/payment-brands/discover.png'),
  link: require('../../../assets/payment-brands/link.png'),
  bank: require('../../../assets/payment-brands/bank.png'),
  card: require('../../../assets/payment-brands/card.png'),
  apple_pay: require('../../../assets/payment-brands/apple_pay.png'),
  google_pay: require('../../../assets/payment-brands/google_pay.png'),
}

type Props = {
  iconKey: ExpressPaymentBrandIconKey
  height?: number
}

export function PaymentMethodBrandIcon({ iconKey, height = 24 }: Props) {
  const source = BRAND_SOURCES[iconKey] ?? BRAND_SOURCES.card
  if (!source) {
    return (
      <View style={[styles.fallback, { height, width: height * 1.5 }]} accessibilityElementsHidden>
        <CreditCard size={Math.max(12, height - 8)} color={colors.text.secondary} strokeWidth={2} />
      </View>
    )
  }
  return (
    <Image
      source={source}
      style={[styles.icon, { height, width: height * 1.5 }]}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  )
}

const styles = StyleSheet.create({
  icon: {
    flexShrink: 0,
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
})

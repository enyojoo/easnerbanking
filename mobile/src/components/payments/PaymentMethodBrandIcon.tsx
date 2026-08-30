import React from 'react'
import { Image, StyleSheet, View } from 'react-native'
import { CreditCard } from 'lucide-react-native'
import type { ExpressPaymentBrandIconKey } from '@easner/shared'
import { colors } from '../../theme'
import { AppleBrandMark, GoogleBrandMark } from './WalletBrandMarks'

const BRAND_SOURCES: Partial<Record<ExpressPaymentBrandIconKey, number>> = {
  visa: require('../../../assets/payment-brands/visa.png'),
  mastercard: require('../../../assets/payment-brands/mastercard.png'),
  amex: require('../../../assets/payment-brands/amex.png'),
  discover: require('../../../assets/payment-brands/discover.png'),
  link: require('../../../assets/payment-brands/link.png'),
  bank: require('../../../assets/payment-brands/bank.png'),
  card: require('../../../assets/payment-brands/card.png'),
}

type Props = {
  iconKey: ExpressPaymentBrandIconKey
  height?: number
}

function isAppleBrand(iconKey: ExpressPaymentBrandIconKey): boolean {
  return iconKey === 'apple' || iconKey === 'apple_pay'
}

function isGoogleBrand(iconKey: ExpressPaymentBrandIconKey): boolean {
  return iconKey === 'google' || iconKey === 'google_pay'
}

export function PaymentMethodBrandIcon({ iconKey, height = 24 }: Props) {
  if (isAppleBrand(iconKey)) {
    return (
      <View style={[styles.markWrap, { height, width: height }]} accessibilityElementsHidden>
        <AppleBrandMark size={Math.round(height * 0.92)} />
      </View>
    )
  }
  if (isGoogleBrand(iconKey)) {
    return (
      <View style={[styles.markWrap, { height, width: height }]} accessibilityElementsHidden>
        <GoogleBrandMark size={Math.round(height * 0.92)} />
      </View>
    )
  }

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
  markWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
})

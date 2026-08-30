import React from 'react'
import { View, StyleSheet } from 'react-native'
import { CreditCard, Landmark } from 'lucide-react-native'
import { expressDepositMethodTitle } from '@easner/shared'
import { AppleBrandMark, GoogleBrandMark } from '../payments/WalletBrandMarks'
import { colors } from '../../theme'

type ExpressCashKind = 'express_card' | 'express_apple_pay' | 'express_google_pay' | 'express_ach'

const SIZE = 48
const ICON = 22

export function ExpressMethodLogo({
  kind,
  size = SIZE,
}: {
  kind: ExpressCashKind
  size?: number
}) {
  const label = expressDepositMethodTitle(kind)
  const icon = Math.max(12, Math.round((ICON * size) / SIZE))
  const apple = Math.max(12, Math.round((26 * size) / SIZE))
  const circleStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  }
  if (kind === 'express_apple_pay') {
    return (
      <View style={[styles.circle, styles.apple, circleStyle]} accessibilityLabel={label}>
        <AppleBrandMark size={apple} />
      </View>
    )
  }
  if (kind === 'express_google_pay') {
    return (
      <View style={[styles.circle, styles.google, circleStyle]} accessibilityLabel={label}>
        <GoogleBrandMark size={icon} />
      </View>
    )
  }
  if (kind === 'express_ach') {
    return (
      <View style={[styles.circle, styles.neutral, circleStyle]} accessibilityLabel={label}>
        <Landmark size={icon} color={colors.text.primary} strokeWidth={2} />
      </View>
    )
  }
  return (
    <View style={[styles.circle, styles.neutral, circleStyle]} accessibilityLabel={label}>
      <CreditCard size={icon} color={colors.text.primary} strokeWidth={2} />
    </View>
  )
}

const styles = StyleSheet.create({
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apple: {
    backgroundColor: '#FFFFFF',
    borderWidth: 0.5,
    borderColor: colors.frame.border,
  },
  google: {
    backgroundColor: '#FFFFFF',
    borderWidth: 0.5,
    borderColor: colors.frame.border,
  },
  neutral: {
    backgroundColor: colors.background.secondary,
    borderWidth: 0.5,
    borderColor: colors.frame.border,
  },
})

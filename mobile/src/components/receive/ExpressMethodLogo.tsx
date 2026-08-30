import React from 'react'
import { View, StyleSheet } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { CreditCard, Landmark } from 'lucide-react-native'
import { expressDepositMethodTitle } from '@easner/shared'
import { colors } from '../../theme'

type ExpressCashKind = 'express_card' | 'express_apple_pay' | 'express_google_pay' | 'express_ach'

const SIZE = 48
const ICON = 22

/** Official Apple mark from `payment-brands/apple.svg` (bitten apple + leaf). */
const APPLE_LOGO_PATH =
  'M46.2 28.4c1.5-1.8 2.5-4.3 2.2-6.8-2.1.1-4.7 1.4-6.2 3.2-1.4 1.6-2.6 4.2-2.3 6.6 2.5.2 4.8-1.2 6.3-3zM48.4 32.2c-3.6-.2-6.6 2-8.3 2-1.8 0-4.5-1.9-7.4-1.9-3.8.1-7.3 2.2-9.2 5.6-4 6.9-1 17.1 2.8 22.7 1.8 2.8 4 5.8 6.9 5.7 2.7-.1 3.8-1.8 7.1-1.8s4.3 1.8 7.2 1.7c3-.1 4.9-2.7 6.7-5.5 2.1-3.2 3-6.4 3-6.5-.1 0-5.8-2.2-5.8-8.9 0-5.6 4.6-8.3 4.8-8.4-2.6-3.9-6.7-4.3-8.1-4.4z'

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
        <Svg width={apple} height={apple} viewBox="23.4 21.4 36.2 45.2" accessibilityElementsHidden>
          <Path fill="#111111" d={APPLE_LOGO_PATH} />
        </Svg>
      </View>
    )
  }
  if (kind === 'express_google_pay') {
    return (
      <View style={[styles.circle, styles.google, circleStyle]} accessibilityLabel={label}>
        <Svg width={icon} height={icon} viewBox="0 0 24 24" accessibilityElementsHidden>
          <Path
            fill="#4285F4"
            d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.4c-.3 1.5-1.1 2.8-2.4 3.7v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8z"
          />
          <Path
            fill="#34A853"
            d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.2 0-5.8-2.1-6.8-5H1.2v3.1C3.3 21.3 7.3 24 12 24z"
          />
          <Path
            fill="#FBBC05"
            d="M5.2 14.3c-.5-1.4-.5-2.9 0-4.3V7H1.2C-.4 10.2-.4 13.8 1.2 17l4-2.7z"
          />
          <Path
            fill="#EA4335"
            d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.5-3.5C18 1.1 15.2 0 12 0 7.3 0 3.3 2.7 1.2 7l4 3.1c1-2.9 3.6-5.3 6.8-5.3z"
          />
        </Svg>
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

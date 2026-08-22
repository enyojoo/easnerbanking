import React from 'react'
import { View, StyleSheet } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { Apple, CreditCard, Landmark } from 'lucide-react-native'
import { expressDepositMethodTitle } from '@easner/shared'

type ExpressCashKind = 'express_card' | 'express_apple_pay' | 'express_google_pay' | 'express_ach'
import { colors } from '../../theme'

const SIZE = 48
const ICON = 22

function GoogleGMark() {
  return (
    <Svg width={ICON} height={ICON} viewBox="0 0 24 24" accessibilityElementsHidden>
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
  )
}

export function ExpressMethodLogo({ kind }: { kind: ExpressCashKind }) {
  const label = expressDepositMethodTitle(kind)
  if (kind === 'express_apple_pay') {
    return (
      <View style={[styles.circle, styles.apple]} accessibilityLabel={label}>
        <Apple size={ICON} color="#FFFFFF" fill="#FFFFFF" strokeWidth={1.5} />
      </View>
    )
  }
  if (kind === 'express_google_pay') {
    return (
      <View style={[styles.circle, styles.google]} accessibilityLabel={label}>
        <GoogleGMark />
      </View>
    )
  }
  if (kind === 'express_ach') {
    return (
      <View style={[styles.circle, styles.neutral]} accessibilityLabel={label}>
        <Landmark size={ICON} color={colors.text.primary} strokeWidth={2} />
      </View>
    )
  }
  return (
    <View style={[styles.circle, styles.neutral]} accessibilityLabel={label}>
      <CreditCard size={ICON} color={colors.text.primary} strokeWidth={2} />
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
    backgroundColor: '#111111',
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

import React from 'react'
import { View, StyleSheet } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { CreditCard, Landmark } from 'lucide-react-native'
import { expressDepositMethodTitle } from '@easner/shared'
import { colors } from '../../theme'

type ExpressCashKind = 'express_card' | 'express_apple_pay' | 'express_google_pay' | 'express_ach'

const SIZE = 48
const ICON = 22

/** Official Apple mark (Simple Icons), not the Lucide stand-in. */
function AppleLogoMark() {
  return (
    <Svg width={ICON} height={ICON} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path
        fill="#111111"
        d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27 1.29-1.08.5-2.23-.25-3.1-1.98C4.72 16.57 5.2 12.29 6.55 9.91c.96-1.7 2.75-2.73 4.65-2.76 1.44-.03 2.8.98 3.57.98s2.43-1.22 4.11-1.03c.69.09 2.63.55 3.89 2.08-.1.06-2.32 1.36-2.3 4.04.03 3.22 2.83 4.29 2.86 4.31-.03.07-.44 1.49-1.48 2.94zM16 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
      />
    </Svg>
  )
}

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
        <AppleLogoMark />
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

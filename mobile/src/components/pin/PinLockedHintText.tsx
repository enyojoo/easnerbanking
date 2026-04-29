import React from 'react'
import { View, Text, StyleSheet, Platform, type StyleProp, type TextStyle } from 'react-native'
import { formatLockCountdown } from '../../lib/pinLockCountdown'
import { fontFamily } from '../../theme'

/** Width reserved for `00:00` so tick updates don’t shift the surrounding sentence. */
const COUNTDOWN_SLOT_WIDTH = 54

type Props = {
  msRemaining: number
  prefixStyle: StyleProp<TextStyle>
  /** Applied on top of prefix style for the time digits (e.g. same color as prefix). */
  digitsStyle?: StyleProp<TextStyle>
}

export function PinLockedHintText({ msRemaining, prefixStyle, digitsStyle }: Props) {
  return (
    <View style={styles.row}>
      <Text style={prefixStyle}>PIN locked. Try again in </Text>
      <View style={styles.countdownSlot}>
        <Text style={[prefixStyle, styles.digits, digitsStyle]}>
          {formatLockCountdown(msRemaining)}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  countdownSlot: {
    width: COUNTDOWN_SLOT_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digits: {
    fontFamily: fontFamily.mono,
    ...Platform.select({
      ios: { fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] },
      default: {},
    }),
  },
})

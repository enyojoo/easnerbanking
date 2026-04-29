import React, { useMemo } from 'react'
import { View, StyleSheet, Platform } from 'react-native'
import { BlurView } from 'expo-blur'
import { useThemeColors } from '../../theme'

/**
 * Tab-bar / narrow chrome: blur + glass tint + top hairline (design system section 4).
 * Android keeps solid tab bar via navigator styles; this layer still adds blur where supported.
 */
export default function FrostedChromeBackground() {
  const palette = useThemeColors()
  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          ...StyleSheet.absoluteFillObject,
          overflow: 'hidden',
        },
        tint: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: palette.glass.surface,
        },
        topHairline: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: StyleSheet.hairlineWidth,
          backgroundColor: palette.glass.border,
        },
      }),
    [palette.glass.border, palette.glass.surface],
  )

  return (
    <View style={styles.root}>
      <BlurView
        style={StyleSheet.absoluteFill}
        intensity={Platform.OS === 'ios' ? 72 : 48}
        tint="light"
      />
      <View style={styles.tint} pointerEvents="none" />
      <View style={styles.topHairline} pointerEvents="none" />
    </View>
  )
}

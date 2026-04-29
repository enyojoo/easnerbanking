import React from 'react'
import { View, StyleSheet, type ViewProps, type StyleProp, type ViewStyle } from 'react-native'
import { borderRadius, shadows, spacing, useThemeColors } from '../../theme'

type PremiumSurfaceProps = ViewProps & {
  elevated?: boolean
  padded?: boolean
  style?: StyleProp<ViewStyle>
}

export default function PremiumSurface({
  elevated = false,
  padded = true,
  style,
  children,
  ...rest
}: PremiumSurfaceProps) {
  const palette = useThemeColors()

  return (
    <View
      {...rest}
      style={[
        styles.base,
        {
          backgroundColor: palette.semantic.card,
          borderColor: palette.border.default,
        },
        elevated ? shadows.sm : shadows.xs,
        padded && styles.padded,
        style,
      ]}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: borderRadius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
  },
  padded: {
    padding: spacing[5],
  },
})


import React from 'react'
import { View, ViewProps, StyleSheet } from 'react-native'
import { colors, borderRadius, spacing } from '../../theme'

export type SurfaceProps = ViewProps & {
  /** Padding inside the surface */
  padding?: keyof typeof spacing | 'none'
  variant?: 'default' | 'muted'
}

/**
 * Card-like surface: matches business `Card` – white/muted bg, semantic border, 8px radius.
 */
export function Surface({
  style,
  padding = 4,
  variant = 'default',
  children,
  ...rest
}: SurfaceProps) {
  const pad = padding === 'none' ? 0 : spacing[padding]
  return (
    <View
      style={[
        styles.base,
        variant === 'muted' && styles.muted,
        { padding: pad },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.semantic.card,
    borderWidth: 1,
    borderColor: colors.semantic.border,
    borderRadius: borderRadius.md,
  },
  muted: {
    backgroundColor: colors.semantic.muted,
  },
})

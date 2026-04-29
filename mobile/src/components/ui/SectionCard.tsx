import React, { useMemo } from 'react'
import { StyleSheet, View, ViewProps, ViewStyle } from 'react-native'
import {
  borderRadius as br,
  spacing,
  surfaceFrameStyle,
  useThemeColors,
} from '../../theme'
import type { SurfaceFrameShadow } from '../../theme'
import type { Colors } from '../../theme/colors'

export type SectionCardProps = ViewProps & {
  /** Visual lift; defaults to `'xs'` (calm raised plate). */
  shadow?: SurfaceFrameShadow
  /** Border radius override; defaults to 20 (`borderRadius['2xl']`). */
  radius?: number
  /** Padding inside the card; defaults to `spacing[4]` (16). */
  padding?: number
  /** When true, the card has no internal padding (caller composes rows). */
  flush?: boolean
}

/**
 * The canonical white "section card" used across the redesigned Dashboard, Activity,
 * More, and TransactionDetails screens. Sits on the gray app canvas with a hairline
 * border and a soft shadow.
 */
export function SectionCard({
  children,
  style,
  shadow = 'xs',
  radius = br['2xl'],
  padding = spacing[4],
  flush = false,
  ...rest
}: SectionCardProps) {
  const palette = useThemeColors()
  const styles = useMemo(
    () => createStyles(palette, shadow, radius, flush ? 0 : padding),
    [palette, shadow, radius, flush, padding],
  )

  const flatStyle: ViewStyle | ViewStyle[] | null = Array.isArray(style)
    ? (style.filter(Boolean) as ViewStyle[])
    : (style as ViewStyle | null) ?? null

  return (
    <View style={[styles.card, flatStyle]} {...rest}>
      {children}
    </View>
  )
}

function createStyles(
  c: Colors,
  shadow: SurfaceFrameShadow,
  radius: number,
  pad: number,
) {
  return StyleSheet.create({
    card: {
      ...surfaceFrameStyle(c, { shadow, radius }),
      padding: pad,
    },
  })
}

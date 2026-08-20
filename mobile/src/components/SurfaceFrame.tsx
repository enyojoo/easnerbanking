import React from 'react'
import { View, type ViewProps } from 'react-native'
import { useThemeColors } from '../contexts/ThemePaletteContext'
import {
  surfaceFrameStyle,
  type SurfaceFrameOptions,
} from '../theme/surfaceFrame'

type Props = ViewProps &
  SurfaceFrameOptions & {
    children: React.ReactNode
  }

/**
 * Theme-aware raised surface – same tokens as More/Dashboard section trays.
 */
export function SurfaceFrame({ children, style, shadow, radius, ...rest }: Props) {
  const c = useThemeColors()
  return (
    <View style={[surfaceFrameStyle(c, { shadow, radius }), style]} {...rest}>
      {children}
    </View>
  )
}

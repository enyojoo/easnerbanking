import { useMemo } from 'react'
import { useWindowDimensions } from 'react-native'
import { typographyScale, scaledFontSize } from '../theme/typography'

/** Reactive typography scale (dimensions + system font scale). */
export function useTypographyScale() {
  const { width } = useWindowDimensions()
  return useMemo(() => typographyScale(width), [width])
}

export { scaledFontSize }

import { useMemo } from 'react'
import { useWindowDimensions } from 'react-native'
import { typographyScale, scaledFontSize } from '../theme/typography'
import { getEffectiveWindowPoints } from '../lib/effective-window'

/** Reactive typography scale (dimensions + system font scale). */
export function useTypographyScale() {
  const { width, height } = useWindowDimensions()
  const effective = useMemo(() => getEffectiveWindowPoints({ width, height }), [height, width])
  return useMemo(() => typographyScale(effective.width), [effective.width])
}

export { scaledFontSize }

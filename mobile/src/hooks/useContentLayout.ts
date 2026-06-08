import { useMemo } from 'react'
import { useWindowDimensions } from 'react-native'
import { REGULAR_WIDTH_BREAKPOINT, getContentWidth } from '../theme/layoutMetrics'
import { getEffectiveWindowPoints } from '../lib/effective-window'
import { useOptionalResponsiveLayout } from '../contexts/ResponsiveLayoutContext'

type UseContentLayoutOptions = {
  horizontalInset: number
}

export function useContentLayout({ horizontalInset }: UseContentLayoutOptions) {
  const { width, height } = useWindowDimensions()
  const layout = useOptionalResponsiveLayout()
  return useMemo(() => {
    const effective = getEffectiveWindowPoints({ width, height })
    const mode = layout?.mode ?? (effective.width >= REGULAR_WIDTH_BREAKPOINT ? 'tablet' : 'mobile')
    const contentMaxWidth = layout?.contentMaxWidth ?? effective.width
    const contentWidth = getContentWidth(effective.width, horizontalInset)
    return {
      windowWidth: effective.width,
      contentWidth,
      isRegularWidth: effective.width >= REGULAR_WIDTH_BREAKPOINT,
      contentMaxWidth,
      mode,
    }
  }, [height, horizontalInset, layout?.contentMaxWidth, layout?.mode, width])
}

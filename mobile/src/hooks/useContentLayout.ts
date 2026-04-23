import { useMemo } from 'react'
import { useWindowDimensions } from 'react-native'
import { CONTENT_MAX_WIDTH, REGULAR_WIDTH_BREAKPOINT, getContentWidth } from '../theme/layoutMetrics'
import { getEffectiveWindowPoints } from '../lib/effective-window'

type UseContentLayoutOptions = {
  horizontalInset: number
}

export function useContentLayout({ horizontalInset }: UseContentLayoutOptions) {
  const { width, height } = useWindowDimensions()
  return useMemo(() => {
    const effective = getEffectiveWindowPoints({ width, height })
    const contentWidth = getContentWidth(effective.width, horizontalInset)
    return {
      windowWidth: effective.width,
      contentWidth,
      isRegularWidth: effective.width >= REGULAR_WIDTH_BREAKPOINT,
      contentMaxWidth: CONTENT_MAX_WIDTH,
    }
  }, [height, horizontalInset, width])
}

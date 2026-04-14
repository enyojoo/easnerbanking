import { useMemo } from 'react'
import { useWindowDimensions } from 'react-native'
import { CONTENT_MAX_WIDTH, REGULAR_WIDTH_BREAKPOINT, getContentWidth } from '../theme/layoutMetrics'

type UseContentLayoutOptions = {
  horizontalInset: number
}

export function useContentLayout({ horizontalInset }: UseContentLayoutOptions) {
  const { width } = useWindowDimensions()
  return useMemo(() => {
    const contentWidth = getContentWidth(width, horizontalInset)
    return {
      windowWidth: width,
      contentWidth,
      isRegularWidth: width >= REGULAR_WIDTH_BREAKPOINT,
      contentMaxWidth: CONTENT_MAX_WIDTH,
    }
  }, [horizontalInset, width])
}

import { Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useResponsiveLayout } from '../contexts/ResponsiveLayoutContext'
import { layout, spacing } from '../theme'

/** Primary CTA + footer chrome height for scroll clearance above fixed footers. */
export const FIXED_FOOTER_SCROLL_CLEARANCE = 72

/** Bottom padding for scroll `contentContainerStyle`.
 * Shell web: compact (DesktopShell already pads). Native / phone web: safe area + optional tab clearance.
 */
export type ScrollBottomPaddingOptions = {
  /** Tab root (Dashboard, More, …) – layout already reserves the tab bar; use minimal tail padding. */
  tabScreen?: boolean
}

export function useScrollBottomPadding(
  extra: number = spacing[4],
  options?: ScrollBottomPaddingOptions,
): number {
  const insets = useSafeAreaInsets()
  const { showSidebarShell } = useResponsiveLayout()

  if (showSidebarShell) {
    return spacing[4]
  }

  if (Platform.OS === 'web') {
    return extra
  }

  if (options?.tabScreen) {
    return spacing[2]
  }

  return insets.bottom + extra
}

/** Bottom inset for a fixed footer bar container. */
export function useFixedFooterPadding(extra: number = spacing[4]): number {
  const insets = useSafeAreaInsets()
  const { showSidebarShell } = useResponsiveLayout()

  if (showSidebarShell) {
    return spacing[4]
  }

  if (Platform.OS === 'web') {
    return extra
  }

  return insets.bottom + extra
}

/** Scroll/list padding when content sits above a fixed bottom CTA. */
export function useScrollPaddingAboveFooter(
  footerHeight: number = FIXED_FOOTER_SCROLL_CLEARANCE,
  extra: number = spacing[4],
): number {
  const insets = useSafeAreaInsets()
  const { showSidebarShell } = useResponsiveLayout()

  if (showSidebarShell) {
    return footerHeight + spacing[4]
  }

  if (Platform.OS === 'web') {
    return footerHeight + extra
  }

  return insets.bottom + layout.tabBarHeight + footerHeight + extra
}

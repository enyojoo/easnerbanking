import { Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useResponsiveLayout } from '../contexts/ResponsiveLayoutContext'
import { layout, spacing } from '../theme'

/** Bottom padding for scroll `contentContainerStyle` — accounts for tab bar on native / web phone. */
export function useScrollBottomPadding(extra: number = spacing[4]): number {
  const insets = useSafeAreaInsets()
  const { showSidebarShell } = useResponsiveLayout()

  if (showSidebarShell) {
    return spacing[4]
  }

  if (Platform.OS === 'web') {
    return extra
  }

  return insets.bottom + layout.tabBarHeight + extra
}

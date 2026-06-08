import React, { useMemo, type ReactNode } from 'react'
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets,
  type EdgeInsets,
} from 'react-native-safe-area-context'
import { useResponsiveLayout } from '../../contexts/ResponsiveLayoutContext'

const ZERO_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * On Expo web with the sidebar shell, safe-area + tab-bar inset padding is redundant
 * (tabs are hidden; DesktopHeader owns top chrome). Zeroing insets avoids a large dead
 * band at the bottom of scroll surfaces.
 */
export function ShellAwareSafeArea({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const { showSidebarShell } = useResponsiveLayout()

  const resolved = useMemo(
    () => (showSidebarShell ? ZERO_INSETS : insets),
    [showSidebarShell, insets],
  )

  return (
    <SafeAreaInsetsContext.Provider value={resolved}>{children}</SafeAreaInsetsContext.Provider>
  )
}

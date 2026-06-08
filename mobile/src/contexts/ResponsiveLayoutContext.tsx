import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Platform, useWindowDimensions } from 'react-native'
import {
  CONTENT_MAX_WIDTH,
  CONTENT_MAX_WIDTH_DESKTOP,
  CONTENT_MAX_WIDTH_OVERVIEW,
  HEADER_HEIGHT,
  SIDEBAR_WIDTH,
  TABLET_MAX_WIDTH,
  getLayoutMode,
  type LayoutMode,
} from '../theme/layoutMetrics'
import { getEffectiveWindowPoints } from '../lib/effective-window'

type ResponsiveLayoutValue = {
  mode: LayoutMode
  width: number
  height: number
  isWeb: boolean
  /** True on web tablet/desktop — sidebar + top header shell (business-style). */
  showSidebarShell: boolean
  contentMaxWidth: number
  sidebarWidth: number
  headerHeight: number
}

const ResponsiveLayoutContext = createContext<ResponsiveLayoutValue | null>(null)

function resolveContentMaxWidth(mode: LayoutMode, viewportWidth: number): number {
  if (mode === 'desktop') {
    const available = Math.max(0, viewportWidth - SIDEBAR_WIDTH)
    return Math.min(available, CONTENT_MAX_WIDTH_DESKTOP)
  }
  if (mode === 'tablet') {
    return Math.max(0, viewportWidth - SIDEBAR_WIDTH)
  }
  return CONTENT_MAX_WIDTH
}

export function ResponsiveLayoutProvider({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions()
  const [resizeTick, setResizeTick] = useState(0)

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    let timer: ReturnType<typeof setTimeout> | null = null
    const onResize = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setResizeTick((t) => t + 1), 100)
    }
    window.addEventListener('resize', onResize)
    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const value = useMemo(() => {
    void resizeTick
    const effective = getEffectiveWindowPoints({ width, height })
    const mode = getLayoutMode(effective.width)
    const isWeb = Platform.OS === 'web'
    const showSidebarShell = isWeb && (mode === 'tablet' || mode === 'desktop')

    return {
      mode,
      width: effective.width,
      height: effective.height,
      isWeb,
      showSidebarShell,
      contentMaxWidth: resolveContentMaxWidth(mode, effective.width),
      sidebarWidth: SIDEBAR_WIDTH,
      headerHeight: HEADER_HEIGHT,
    }
  }, [height, resizeTick, width])

  return (
    <ResponsiveLayoutContext.Provider value={value}>
      {children}
    </ResponsiveLayoutContext.Provider>
  )
}

export function useResponsiveLayout(): ResponsiveLayoutValue {
  const ctx = useContext(ResponsiveLayoutContext)
  if (!ctx) {
    throw new Error('useResponsiveLayout must be used within ResponsiveLayoutProvider')
  }
  return ctx
}

/** Route-aware desktop content max-width (overview vs data-heavy screens). */
export function useDesktopContentMaxWidth(routeName?: string): number {
  const { mode } = useResponsiveLayout()
  return useMemo(() => {
    if (mode !== 'desktop') return CONTENT_MAX_WIDTH
    const overviewRoutes = new Set(['Dashboard', 'MainTabs'])
    if (routeName && overviewRoutes.has(routeName)) {
      return CONTENT_MAX_WIDTH_OVERVIEW
    }
    return CONTENT_MAX_WIDTH_DESKTOP
  }, [mode, routeName])
}

export function useOptionalResponsiveLayout(): ResponsiveLayoutValue | null {
  return useContext(ResponsiveLayoutContext)
}

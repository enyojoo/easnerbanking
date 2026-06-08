import React, { type ReactNode, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { useThemeColors } from '../../contexts/ThemePaletteContext'
import { getRootNavigationState, useRootNavigationRouteTick } from '../../navigation/rootNavigationRef'
import {
  CONTENT_MAX_WIDTH_DESKTOP,
  CONTENT_MAX_WIDTH_OVERVIEW,
  HEADER_HEIGHT,
  SIDEBAR_WIDTH,
  spacing,
} from '../../theme'
import { DesktopHeader } from './DesktopHeader'
import { DesktopNav } from './DesktopNav'

const OVERVIEW_ROUTES = new Set(['Dashboard', 'Card', 'MainTabs'])

type DesktopShellProps = {
  children: ReactNode
}

function getLeafRouteName(state: { routes: { name: string; state?: unknown }[]; index: number } | undefined): string | undefined {
  if (!state) return undefined
  const route = state.routes[state.index]
  if (!route) return undefined
  if (route.state && typeof route.state === 'object' && route.state !== null && 'routes' in route.state) {
    return getLeafRouteName(route.state as { routes: { name: string; state?: unknown }[]; index: number })
  }
  return route.name
}

export function DesktopShell({ children }: DesktopShellProps) {
  const palette = useThemeColors()
  const routeTick = useRootNavigationRouteTick()
  const leafRoute = useMemo(() => {
    void routeTick
    return getLeafRouteName(
      getRootNavigationState() as { routes: { name: string; state?: unknown }[]; index: number } | undefined,
    )
  }, [routeTick])

  const contentMaxWidth = useMemo(() => {
    if (leafRoute && OVERVIEW_ROUTES.has(leafRoute)) {
      return CONTENT_MAX_WIDTH_OVERVIEW
    }
    return CONTENT_MAX_WIDTH_DESKTOP
  }, [leafRoute])

  return (
    <View style={[styles.root, { backgroundColor: palette.background.primary }]}>
      <DesktopNav />
      <DesktopHeader />
      <View
        style={[
          styles.main,
          {
            marginLeft: SIDEBAR_WIDTH,
            paddingTop: HEADER_HEIGHT,
          },
        ]}
      >
        <View style={[styles.mainInner, { maxWidth: contentMaxWidth }]}>
          {children}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    minHeight: '100%',
  },
  main: {
    flex: 1,
    width: '100%',
    paddingHorizontal: spacing[6],
  },
  mainInner: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
  },
})

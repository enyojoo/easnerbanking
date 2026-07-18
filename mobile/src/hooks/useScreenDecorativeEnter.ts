import { useMemo } from 'react'
import { Platform } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useResponsiveLayout } from '../contexts/ResponsiveLayoutContext'
import {
  getPreviousRouteFromState,
  shouldSkipDecorativeEnterForRoute,
} from '../navigation/resolveScreenTransitionOptions'
import type { ScreenRouteName } from '../navigation/screenTransitionRegistry'

/**
 * Returns whether decorative screen enter animations (EaseEnter, useCalmParallelEnter)
 * should run. Skips when the stack transition already animates content in.
 */
export function useScreenDecorativeEnter(): { shouldAnimateEnter: boolean } {
  const navigation = useNavigation()
  const route = useRoute()
  const { showSidebarShell, mode } = useResponsiveLayout()

  const shouldAnimateEnter = useMemo(() => {
    if (Platform.OS === 'web') return false

    const { name: previousRouteName } = getPreviousRouteFromState(
      navigation.getState() as Parameters<typeof getPreviousRouteFromState>[0],
    )

    const skip = shouldSkipDecorativeEnterForRoute({
      routeName: route.name as ScreenRouteName,
      previousRouteName,
      routeParams: route.params as Record<string, unknown> | undefined,
      layoutMode: mode,
      showSidebarShell,
    })

    return !skip
  }, [navigation, route.name, route.params, mode, showSidebarShell])

  return { shouldAnimateEnter }
}

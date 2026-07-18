import { useCallback } from 'react'
import type { StackNavigationOptions } from '@react-navigation/stack'
import { useResponsiveLayout } from '../contexts/ResponsiveLayoutContext'
import {
  getPreviousRouteFromState,
  resolveScreenTransitionOptions,
} from '../navigation/resolveScreenTransitionOptions'
import type { ScreenRouteName } from '../navigation/screenTransitionRegistry'

type NavigationLike = {
  getState: () => {
    index?: number
    routes?: Array<{ name: string; params?: Record<string, unknown> }>
  }
}

type RouteLike = {
  params?: Record<string, unknown>
}

/** Hook factory for Stack.Screen options — wires responsive web layout into resolver. */
export function useScreenTransitionOptions(routeName: ScreenRouteName) {
  const { showSidebarShell, mode } = useResponsiveLayout()

  return useCallback(
    ({
      navigation,
      route,
    }: {
      navigation: NavigationLike
      route: RouteLike
    }): StackNavigationOptions => {
      const { name: previousRouteName } = getPreviousRouteFromState(
        navigation.getState(),
      )
      return resolveScreenTransitionOptions({
        routeName,
        previousRouteName,
        routeParams: route.params,
        layoutMode: mode,
        showSidebarShell,
      })
    },
    [routeName, showSidebarShell, mode],
  )
}

/** Static resolver for stacks outside ResponsiveLayoutProvider (auth/onboarding). */
export function staticScreenTransitionOptions(routeName: ScreenRouteName) {
  return ({
    navigation,
    route,
  }: {
    navigation: NavigationLike
    route: RouteLike
  }): StackNavigationOptions => {
    const { name: previousRouteName } = getPreviousRouteFromState(
      navigation.getState(),
    )
    return resolveScreenTransitionOptions({
      routeName,
      previousRouteName,
      routeParams: route.params,
    })
  }
}

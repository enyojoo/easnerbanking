import { useCallback, useMemo } from 'react'
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

type ScreenTransitionOptionsFactory = (args: {
  navigation: NavigationLike
  route: RouteLike
}) => StackNavigationOptions

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

/** Single hook for MainStack — stable per-route options callbacks (avoids stack thrash on Android). */
export function useMainStackTransitionOptionsFactory(): (
  routeName: ScreenRouteName,
) => ScreenTransitionOptionsFactory {
  const { showSidebarShell, mode } = useResponsiveLayout()

  return useMemo(() => {
    const cache = new Map<ScreenRouteName, ScreenTransitionOptionsFactory>()

    return (routeName: ScreenRouteName): ScreenTransitionOptionsFactory => {
      const cached = cache.get(routeName)
      if (cached) return cached

      const factory: ScreenTransitionOptionsFactory = ({ navigation, route }) => {
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
      }

      cache.set(routeName, factory)
      return factory
    }
  }, [showSidebarShell, mode])
}

const staticTransitionOptionsCache = new Map<
  ScreenRouteName,
  ScreenTransitionOptionsFactory
>()

/** Static resolver for auth/onboarding stacks — cached callbacks avoid Android stack thrash. */
export function staticScreenTransitionOptions(
  routeName: ScreenRouteName,
): ScreenTransitionOptionsFactory {
  const cached = staticTransitionOptionsCache.get(routeName)
  if (cached) return cached

  const factory: ScreenTransitionOptionsFactory = ({ navigation, route }) => {
    const { name: previousRouteName } = getPreviousRouteFromState(
      navigation.getState(),
    )
    return resolveScreenTransitionOptions({
      routeName,
      previousRouteName,
      routeParams: route.params,
    })
  }

  staticTransitionOptionsCache.set(routeName, factory)
  return factory
}

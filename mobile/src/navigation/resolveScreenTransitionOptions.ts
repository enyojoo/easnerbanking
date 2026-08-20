/**
 * Resolves StackNavigationOptions from screen registry + navigation state.
 */
import { Platform } from 'react-native'
import type { StackNavigationOptions } from '@react-navigation/stack'
import type { LayoutMode } from '../theme/layoutMetrics'
import {
  getScreenTransitionEntry,
  resolveGestureEnabled,
  shouldUseFlowHubInstantTransition,
  type ScreenRouteName,
} from './screenTransitionRegistry'
import {
  authGatePreset,
  flowHubInstantSpec,
  flowStepPreset,
  horizontalPushPreset,
  mainStackPreset,
  modalBottomPreset,
  presetHasStackMotion,
  webFadePreset,
  webInstantPreset,
} from './transitionPresets'

export type ResolveTransitionContext = {
  routeName: string
  previousRouteName?: string
  routeParams?: Record<string, unknown>
  layoutMode?: LayoutMode
  showSidebarShell?: boolean
}

type NavigationStateLike = {
  index?: number
  routes?: Array<{ name: string; params?: Record<string, unknown> }>
}

export function getPreviousRouteFromState(
  state: NavigationStateLike | undefined,
): { name?: string; params?: Record<string, unknown> } {
  const currentIndex = state?.index ?? 0
  const previousRoute = currentIndex > 0 ? state?.routes?.[currentIndex - 1] : null
  return {
    name: previousRoute?.name,
    params: previousRoute?.params as Record<string, unknown> | undefined,
  }
}

function webPresetForIntent(
  instant: boolean,
  showSidebarShell?: boolean,
): StackNavigationOptions {
  if (instant) {
    return webInstantPreset() as StackNavigationOptions
  }
  return webFadePreset(showSidebarShell ? 'desktop' : 'mobile') as StackNavigationOptions
}

function nativePresetForIntent(
  entry: NonNullable<ReturnType<typeof getScreenTransitionEntry>>,
  routeName: string,
  gestureEnabled: boolean,
): StackNavigationOptions {
  switch (entry.intent) {
    case 'modalSheet':
      return modalBottomPreset() as StackNavigationOptions
    case 'flowStep':
      return flowStepPreset(gestureEnabled) as StackNavigationOptions
    case 'authGate':
      return authGatePreset(gestureEnabled) as StackNavigationOptions
    case 'detail':
    case 'settingsLeaf':
      return horizontalPushPreset({ gestureEnabled }) as StackNavigationOptions
    case 'stackEntry':
      return mainStackPreset(gestureEnabled) as StackNavigationOptions
    case 'tabRoot':
      return {
        ...horizontalPushPreset({ gestureEnabled: false }),
        gestureEnabled: false,
      } as StackNavigationOptions
    case 'flowHub':
    default:
      return flowStepPreset(gestureEnabled) as StackNavigationOptions
  }
}

/** Core resolver – pure function, testable without React Navigation. */
export function resolveScreenTransitionOptions(
  ctx: ResolveTransitionContext,
): StackNavigationOptions {
  const {
    routeName,
    previousRouteName,
    routeParams,
    layoutMode,
    showSidebarShell,
  } = ctx

  const entry =
    getScreenTransitionEntry(routeName) ??
    getScreenTransitionEntry('Profile')!

  const hubInstant = shouldUseFlowHubInstantTransition({
    routeName,
    previousRouteName,
    routeParams,
  })

  const platform =
    Platform.OS === 'ios'
      ? 'ios'
      : Platform.OS === 'android'
        ? 'android'
        : 'web'

  const gestureEnabled = resolveGestureEnabled({
    routeName,
    entry,
    platform,
  })

  const base: StackNavigationOptions = {
    headerShown: false,
    gestureEnabled,
  }

  if (routeName === 'ScanWalletAddress') {
    return {
      ...base,
      ...(Platform.OS === 'web'
        ? webPresetForIntent(false, showSidebarShell)
        : (modalBottomPreset() as StackNavigationOptions)),
      cardStyle: { backgroundColor: '#000' },
    }
  }

  if (routeName === 'MainTabs') {
    // MainTabs is always the stack root – instant avoids card interpolator work on cold mount (PIN unlock).
    return {
      ...base,
      gestureEnabled: false,
      ...(Platform.OS === 'web' ? webInstantPreset() : flowHubInstantSpec),
    }
  }

  // Auth/onboarding/PIN gate stacks mount a single root screen on cold entry – instant avoids interpolator work.
  if (
    !previousRouteName &&
    entry.intent === 'authGate' &&
    Platform.OS !== 'web'
  ) {
    return {
      ...base,
      ...flowHubInstantSpec,
    }
  }

  if (hubInstant) {
    const instantPreset =
      Platform.OS === 'web'
        ? webPresetForIntent(true, showSidebarShell)
        : (flowHubInstantSpec as StackNavigationOptions)
    return {
      ...base,
      ...instantPreset,
      gestureEnabled: false,
    }
  }

  if (Platform.OS === 'web') {
    return {
      ...base,
      ...webPresetForIntent(false, showSidebarShell ?? layoutMode !== 'mobile'),
    }
  }

  return {
    ...base,
    ...nativePresetForIntent(entry, routeName, gestureEnabled),
  }
}

/** React Navigation options callback helper. */
export function createScreenTransitionOptions(routeName: ScreenRouteName) {
  return ({
    navigation,
    route,
  }: {
    navigation: { getState: () => NavigationStateLike }
    route: { params?: Record<string, unknown> }
  }): StackNavigationOptions => {
    const { name: previousRouteName } = getPreviousRouteFromState(navigation.getState())
    return resolveScreenTransitionOptions({
      routeName,
      previousRouteName,
      routeParams: route.params as Record<string, unknown> | undefined,
    })
  }
}

/** For decorative enter – true when stack transition already animates content. */
export function shouldSkipDecorativeEnterForRoute(
  ctx: ResolveTransitionContext,
): boolean {
  if (Platform.OS === 'web') return true
  const options = resolveScreenTransitionOptions(ctx)
  return presetHasStackMotion(options as Record<string, unknown>)
}

export { presetHasStackMotion }

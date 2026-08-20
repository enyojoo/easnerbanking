/**
 * Stack transition presets – single source for AppNavigator + transition resolver.
 *
 * Product policy:
 * - iOS + Android share horizontal push for stack navigation (unified motion language).
 * - Flow hubs (send/recipient picker) use instant transitions when chrome is continuous.
 * - Web uses opacity fade (safe on RN Web); hubs stay instant.
 * - Modal sheets slide from bottom with dim overlay.
 */
import { Platform } from 'react-native'
import { TransitionPresets } from '@react-navigation/stack'
import type { StackCardInterpolationProps } from '@react-navigation/stack'
import { USE_NATIVE_DRIVER } from '../lib/animation'

/** Keep in sync with `duration` in `../theme/index.ts` (avoid importing theme – pulls RN native deps in Jest). */
const duration = {
  instant: 0,
  fast: 150,
  normal: 250,
} as const

export type WebFadeTier = 'instant' | 'mobile' | 'desktop'

const timingOpen = (ms: number) =>
  ({
    animation: 'timing' as const,
    config: { duration: ms, useNativeDriver: USE_NATIVE_DRIVER },
  }) as const

const timingClose = (ms: number) =>
  ({
    animation: 'timing' as const,
    config: { duration: ms, useNativeDriver: USE_NATIVE_DRIVER },
  }) as const

function horizontalCardInterpolator({ current, layouts }: StackCardInterpolationProps) {
  return {
    cardStyle: {
      transform: [
        {
          translateX: current.progress.interpolate({
            inputRange: [0, 1],
            outputRange: [layouts.screen.width, 0],
            extrapolate: 'clamp',
          }),
        },
      ],
      opacity: current.progress.interpolate({
        inputRange: [0, 0.05, 1],
        outputRange: [0, 1, 1],
        extrapolate: 'clamp',
      }),
    },
    overlayStyle: {
      opacity: current.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.12],
        extrapolate: 'clamp',
      }),
    },
  }
}

function opacityFadeInterpolator({ current }: StackCardInterpolationProps) {
  return {
    cardStyle: {
      opacity: current.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    },
  }
}

function modalBottomInterpolator({ current, layouts }: StackCardInterpolationProps) {
  return {
    cardStyle: {
      transform: [
        {
          translateY: current.progress.interpolate({
            inputRange: [0, 1],
            outputRange: [layouts.screen.height, 0],
            extrapolate: 'clamp',
          }),
        },
      ],
    },
    overlayStyle: {
      opacity: current.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.45],
        extrapolate: 'clamp',
      }),
    },
  }
}

/** Instant stack transitions on web – hubs and zero-duration native pairs. */
export function webInstantPreset() {
  return Platform.OS === 'web'
    ? ({
        animation: 'none' as const,
        gestureEnabled: false,
      } as const)
    : ({
        transitionSpec: {
          open: timingOpen(duration.instant),
          close: timingClose(duration.instant),
        },
      } as const)
}

/** @deprecated Use webInstantPreset – kept for call-site compatibility during migration. */
export const webStackPreset = webInstantPreset

/** Opacity crossfade for web stack navigations (avoids broken card transforms on RN Web). */
export function webFadePreset(tier: Exclude<WebFadeTier, 'instant'> = 'mobile') {
  if (Platform.OS !== 'web') return {}
  const ms = tier === 'desktop' ? 120 : 150
  return {
    gestureEnabled: false,
    transitionSpec: {
      open: timingOpen(ms),
      close: timingClose(ms),
    },
    cardStyleInterpolator: opacityFadeInterpolator,
  }
}

export type HorizontalPushOptions = {
  openMs?: number
  closeMs?: number
  gestureEnabled?: boolean
  gestureResponseDistance?: number
  overlayOpacity?: number
}

/** Unified horizontal push for iOS and Android. */
export function horizontalPushPreset(options: HorizontalPushOptions = {}) {
  if (Platform.OS === 'web') {
    return webFadePreset('mobile')
  }

  const {
    openMs = 180,
    closeMs = 150,
    gestureEnabled = true,
    gestureResponseDistance = 30,
  } = options

  if (Platform.OS === 'ios') {
    return {
      ...TransitionPresets.SlideFromRightIOS,
      gestureEnabled,
      gestureDirection: 'horizontal' as const,
      gestureResponseDistance,
      gestureVelocityImpact: 0.5,
      transitionSpec: {
        open: timingOpen(openMs),
        close: timingClose(closeMs),
      },
    }
  }

  return {
    gestureEnabled,
    gestureDirection: 'horizontal' as const,
    gestureResponseDistance,
    gestureVelocityImpact: 0.4,
    transitionSpec: {
      open: timingOpen(openMs),
      close: timingClose(closeMs),
    },
    cardStyleInterpolator: horizontalCardInterpolator,
  }
}

/** Main app stack – horizontal push on native; web fade handled by resolver tier. */
export function mainStackPreset(gestureEnabled = true) {
  if (Platform.OS === 'web') {
    return webFadePreset('mobile')
  }
  return horizontalPushPreset({ gestureEnabled, openMs: 180, closeMs: 150 })
}

/** Send / pay / receive flow steps – full horizontal push with wider gesture zone on iOS. */
export function flowStepPreset(gestureEnabled = true) {
  if (Platform.OS === 'web') {
    return webFadePreset('mobile')
  }
  return horizontalPushPreset({
    gestureEnabled,
    openMs: duration.normal,
    closeMs: duration.normal,
    gestureResponseDistance: 60,
  })
}

/** @deprecated Use flowStepPreset */
export function sendFlowStandardPreset(gestureEnabled = true) {
  return flowStepPreset(gestureEnabled)
}

/** Flow hub – instant when adjacent screens share continuous chrome. */
export const flowHubInstantSpec = webInstantPreset()

/** @deprecated Use flowHubInstantSpec */
export const sendFlowInstantTransitionSpec = flowHubInstantSpec

/** Modal sheet – slide from bottom (ScanWalletAddress, etc.). */
export function modalBottomPreset() {
  if (Platform.OS === 'web') {
    return webFadePreset('mobile')
  }
  return {
    gestureEnabled: false,
    transitionSpec: {
      open: timingOpen(duration.normal),
      close: timingClose(duration.fast),
    },
    cardStyleInterpolator: modalBottomInterpolator,
  }
}

/** Auth gate screens – slightly faster horizontal push; gestures controlled per screen. */
export function authGatePreset(gestureEnabled = false) {
  if (Platform.OS === 'web') {
    return webFadePreset('mobile')
  }
  return horizontalPushPreset({
    gestureEnabled,
    openMs: 180,
    closeMs: 150,
    gestureResponseDistance: 30,
  })
}

/** Whether a preset represents a non-instant stack transition (for decorative enter gating). */
export function presetHasStackMotion(
  preset: Record<string, unknown> | undefined,
): boolean {
  if (!preset) return false
  if (preset.animation === 'none') return false
  const spec = preset.transitionSpec as
    | { open?: { config?: { duration?: number } } }
    | undefined
  const openMs = spec?.open?.config?.duration
  if (openMs === 0 || openMs === duration.instant) return false
  return true
}

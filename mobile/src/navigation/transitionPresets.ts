/**
 * Stack transition presets — single source for AppNavigator.
 *
 * Product policy (Android main stack):
 * We keep a **vertical slide-up** for the primary stack on Android (Material-style),
 * with **gestures disabled** on that stack to avoid conflicting with system back and tabs.
 * iOS uses **horizontal** push with interactive pop. Durations stay under ~250ms where possible.
 */
import { Platform } from 'react-native'
import { TransitionPresets } from '@react-navigation/stack'
import { duration } from '../theme'

const timingOpen = (ms: number) =>
  ({
    animation: 'timing' as const,
    config: { duration: ms, useNativeDriver: true },
  }) as const

const timingClose = (ms: number) =>
  ({
    animation: 'timing' as const,
    config: { duration: ms, useNativeDriver: true },
  }) as const

/** Main app stack — iOS: SlideFromRight + custom timing; Android: slide up from bottom */
export function mainStackPreset() {
  if (Platform.OS === 'ios') {
    return {
      ...TransitionPresets.SlideFromRightIOS,
      gestureEnabled: true,
      gestureDirection: 'horizontal' as const,
      gestureResponseDistance: 30,
      gestureVelocityImpact: 0.5,
      transitionSpec: {
        open: timingOpen(180),
        close: timingClose(150),
      },
    }
  }
  return {
    gestureEnabled: false,
    transitionSpec: {
      open: timingOpen(170),
      close: timingClose(150),
    },
    cardStyleInterpolator: ({ current, layouts }: { current: { progress: any }; layouts: { screen: { height: number } } }) => ({
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
        opacity: current.progress.interpolate({
          inputRange: [0, 0.3, 1],
          outputRange: [0, 0.8, 1],
          extrapolate: 'clamp',
        }),
      },
      overlayStyle: {
        opacity: current.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 0.1],
          extrapolate: 'clamp',
        }),
      },
    }),
  }
}

/** Send / pay flow — horizontal on iOS; shallow horizontal on Android */
export function sendFlowStandardPreset() {
  if (Platform.OS === 'ios') {
    return {
      gestureEnabled: true,
      gestureDirection: 'horizontal' as const,
      gestureResponseDistance: 60,
      gestureVelocityImpact: 0.4,
      transitionSpec: {
        open: timingOpen(duration.normal),
        close: timingClose(duration.normal),
      },
      cardStyleInterpolator: ({ current, layouts }: { current: { progress: any }; layouts: { screen: { width: number } } }) => ({
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
            outputRange: [0, 0.2],
            extrapolate: 'clamp',
          }),
        },
      }),
    }
  }
  return {
    gestureEnabled: false,
    transitionSpec: {
      open: timingOpen(duration.normal),
      close: timingClose(duration.normal),
    },
    cardStyleInterpolator: ({ current, layouts }: { current: { progress: any }; layouts: { screen: { width: number } } }) => ({
      cardStyle: {
        transform: [
          {
            translateX: current.progress.interpolate({
              inputRange: [0, 1],
              outputRange: [layouts.screen.width * 0.3, 0],
              extrapolate: 'clamp',
            }),
          },
        ],
        opacity: current.progress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0, 0.9, 1],
          extrapolate: 'clamp',
        }),
      },
    }),
  }
}

/** Same header hub — instant transition when pushing/popping between recipient hub and amount */
export const sendFlowInstantTransitionSpec = {
  transitionSpec: {
    open: timingOpen(duration.instant),
    close: timingClose(duration.instant),
  },
} as const

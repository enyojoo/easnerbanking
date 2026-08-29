/**
 * Native splash only. Do not hold a splash overlay on Expo web.
 * Must stay free of App / navigator imports so preventAutoHide is scheduled
 * even if those modules throw during evaluation.
 *
 * hideAsync must not wait forever on preventAutoHideAsync. If that promise
 * never settles, the native splash never dismisses (stuck on launch).
 */
import { Platform } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'

/** Matches `app.json` / expo-splash-screen backgroundColor (iOS / Android). */
export const NATIVE_SPLASH_BACKGROUND = '#007ACC'

let hideRequested = false
let preventPromise: Promise<void> | null = null

function safeHide() {
  try {
    void SplashScreen.hideAsync().catch(() => {})
  } catch {
    // Native module may not be ready yet.
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | void> {
  return Promise.race([
    promise,
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ])
}

if (Platform.OS === 'web') {
  safeHide()
} else {
  try {
    preventPromise = SplashScreen.preventAutoHideAsync()
      .then(() => undefined)
      .catch(() => {})
  } catch {
    preventPromise = Promise.resolve()
  }
}

export function hideNativeSplash() {
  if (Platform.OS === 'web') return
  if (hideRequested) {
    safeHide()
    return
  }
  hideRequested = true
  void (async () => {
    try {
      if (preventPromise) await withTimeout(preventPromise, 400)
    } catch {
      // ignore
    }
    safeHide()
    setTimeout(() => safeHide(), 50)
    setTimeout(() => safeHide(), 400)
  })()
}

if (Platform.OS !== 'web') {
  setTimeout(() => {
    hideNativeSplash()
  }, 2_000)
}

/**
 * Native splash only. Do not hold a splash overlay on Expo web.
 * Must stay free of App / navigator imports so preventAutoHide is scheduled
 * even if those modules throw during evaluation.
 *
 * Build 206 hid splash from App.tsx after session restore + nav ready.
 * Do not auto-hide after a few seconds — that reveals login under splash.
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
      await preventPromise
    } catch {
      // ignore
    }
    safeHide()
    setTimeout(() => safeHide(), 50)
    setTimeout(() => safeHide(), 400)
  })()
}

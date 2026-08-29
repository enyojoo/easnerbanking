/**
 * Native splash only. Do not hold a splash overlay on Expo web.
 * Must stay free of App / navigator imports so the failsafe timer is scheduled
 * even if those modules throw during evaluation.
 */
import { Platform } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'

/** Matches `app.json` / expo-splash-screen backgroundColor (iOS / Android). */
export const NATIVE_SPLASH_BACKGROUND = '#007ACC'

function safeHide() {
  try {
    void SplashScreen.hideAsync().catch(() => {})
  } catch {
    // Native module may not be ready yet.
  }
}

function safePreventAutoHide() {
  try {
    void SplashScreen.preventAutoHideAsync().catch(() => {})
  } catch {
    // Native module may not be ready yet.
  }
}

if (Platform.OS === 'web') {
  safeHide()
} else {
  safePreventAutoHide()
}

export function hideNativeSplash() {
  if (Platform.OS === 'web') return
  safeHide()
}

if (Platform.OS !== 'web') {
  setTimeout(() => {
    hideNativeSplash()
  }, 8_000)
}

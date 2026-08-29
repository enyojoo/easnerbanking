/**
 * Native splash only. Do not hold a splash overlay on Expo web.
 */
import { Platform } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'

/** Matches `app.json` / expo-splash-screen backgroundColor (iOS / Android). */
export const NATIVE_SPLASH_BACKGROUND = '#007ACC'

if (Platform.OS === 'web') {
  void SplashScreen.hideAsync().catch(() => {})
} else {
  SplashScreen.preventAutoHideAsync().catch(() => {})
}

export function hideNativeSplash() {
  void SplashScreen.hideAsync().catch(() => {})
}

if (Platform.OS !== 'web') {
  setTimeout(() => {
    hideNativeSplash()
  }, 8_000)
}

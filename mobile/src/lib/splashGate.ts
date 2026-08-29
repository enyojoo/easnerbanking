/**
 * Must be imported from index.ts *before* `App` so this module evaluates
 * (and the failsafe timer is scheduled) even if App.tsx / AppNavigator
 * hang during static import. ES module import order is depth-first of
 * index.ts's import list — keep this file free of App / navigator imports.
 */
import { Platform } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'

/** Matches `app.json` / expo-splash-screen backgroundColor. */
export const NATIVE_SPLASH_BACKGROUND = '#007ACC'

SplashScreen.preventAutoHideAsync().catch(() => {})

export function hideNativeSplash() {
  if (Platform.OS === 'web') return
  void SplashScreen.hideAsync().catch(() => {})
}

if (Platform.OS !== 'web') {
  setTimeout(() => {
    hideNativeSplash()
  }, 8_000)
}

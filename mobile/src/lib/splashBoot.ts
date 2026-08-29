/**
 * Expo SDK 57: call preventAutoHideAsync in global scope (no await).
 * https://docs.expo.dev/versions/v57.0.0/sdk/splash-screen/
 *
 * iOS release can ignore the first hideAsync (returns undefined). Retry hide().
 * https://github.com/expo/expo/discussions/28175
 */
import { Platform } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'

function dismissNativeSplash() {
  try {
    SplashScreen.hide()
  } catch {
    // hide() may throw if the native module is not ready yet.
  }
  try {
    void SplashScreen.hideAsync().catch(() => {})
  } catch {
    // ignore
  }
}

if (Platform.OS !== 'web') {
  SplashScreen.preventAutoHideAsync()
  dismissNativeSplash()
  for (const ms of [100, 400, 800, 1_500, 2_000, 2_500, 4_000, 6_000]) {
    setTimeout(dismissNativeSplash, ms)
  }
}

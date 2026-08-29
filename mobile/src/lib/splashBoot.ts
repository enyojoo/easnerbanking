/**
 * First import from index.ts so the native splash cannot stay up if a later
 * module hangs (PostHog, AppNavigator). Build 206 hid from App.tsx only;
 * that never runs if App returns null or auth never finishes.
 */
import { Platform } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'

if (Platform.OS !== 'web') {
  try {
    void SplashScreen.preventAutoHideAsync().catch(() => {})
  } catch {
    // Native module may not be ready yet.
  }
  setTimeout(() => {
    void SplashScreen.hideAsync().catch(() => {})
  }, 2_500)
}

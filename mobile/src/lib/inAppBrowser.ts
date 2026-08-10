import { Platform } from 'react-native'
import * as WebBrowser from 'expo-web-browser'

/** Shared chrome for Legal, KYC, Google OAuth, and other in-app browser surfaces. */
export const EASNER_IN_APP_BROWSER_OPTIONS = {
  controlsColor: '#0F1110',
  enableBarCollapsing: true,
  showTitle: true,
} as const

/**
 * Open the same SFSafariViewController / Chrome Custom Tab used for Legal + KYC.
 * Avoids iOS ASWebAuthenticationSession (“wants to use … to Sign In”) prompts.
 *
 * Android `createTask: false` keeps the Custom Tab in the app task so
 * `singleTask` MainActivity still receives OAuth deep-link callbacks.
 */
export async function openEasnerInAppBrowser(url: string) {
  return WebBrowser.openBrowserAsync(url, {
    ...EASNER_IN_APP_BROWSER_OPTIONS,
    ...(Platform.OS === 'android' ? { createTask: false } : {}),
  })
}

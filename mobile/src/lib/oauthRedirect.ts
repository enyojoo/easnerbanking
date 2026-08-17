import { Platform } from 'react-native'
import { makeRedirectUri } from 'expo-auth-session'
import { APP_URLS } from '@easner/shared'
import { isExpoGo } from './expoGo'

/**
 * OAuth return URL for Supabase `signInWithOAuth`.
 *
 * Store builds use the HTTPS universal link so the same SFSafariViewController /
 * Custom Tab UX can return reliably on iOS 18.4+ (custom schemes are flaky there).
 * Must be listed in Supabase Auth → Redirect URLs alongside `easner://auth/callback`.
 */
export function getOAuthRedirectUri(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`
  }

  if (isExpoGo) {
    return makeRedirectUri({ scheme: 'easner', path: 'auth/callback' })
  }

  return `${APP_URLS.app}/auth/callback`
}

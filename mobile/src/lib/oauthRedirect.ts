import { Platform } from 'react-native'
import { makeRedirectUri } from 'expo-auth-session'

/**
 * OAuth return URL for Supabase `signInWithOAuth`.
 *
 * Native store builds use the app deep link (`easner://auth/callback`) so
 * `openAuthSessionAsync` can auto-return to the app when Google finishes.
 * Must be listed in Supabase Auth → Redirect URLs alongside the HTTPS callback.
 */
export function getOAuthRedirectUri(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`
  }

  return makeRedirectUri({ scheme: 'easner', path: 'auth/callback' })
}

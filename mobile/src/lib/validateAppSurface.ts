import { supabase } from './supabase'
import { getSessionReliable } from './authSession'
import { apiRequest } from './apiClient'

/** Enforces mobile-only accounts (and blocks org / office-admin identities). */
export async function ensureConsumerMobileAccess(): Promise<{ error: Error | null }> {
  try {
    const session = await getSessionReliable()
    /** Transient while SecureStore/AsyncStorage hydrates — caller must not treat as "denied". */
    if (!session?.access_token) {
      return { error: new Error('Unauthorized') }
    }
    const res = await apiRequest('/api/auth/validate-app-surface', {
      method: 'POST',
      body: JSON.stringify({
        surface: 'consumer_mobile',
        accessToken: session.access_token,
      }),
    })
    if ((res as { isNetworkError?: boolean }).isNetworkError) {
      return { error: null }
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
    if (!res.ok) {
      const code = typeof data.code === 'string' ? data.code : ''
      const isPermanentSurfaceDenial =
        code === 'WRONG_ROLE_FOR_MOBILE' ||
        code === 'OFFICE_ADMIN_WRONG_APP' ||
        code === 'ROLE_CONFLICT'
      if (isPermanentSurfaceDenial) {
        await supabase.auth.signOut()
        return {
          error: new Error(
            typeof data.error === 'string' ? data.error : 'This account cannot use the Easner mobile app.',
          ),
        }
      }
      // Do not sign out on transient/unknown denials to avoid login bounce loops.
      console.warn('ensureConsumerMobileAccess: non-permanent validation failure', res.status, code)
      return { error: null }
    }
    return { error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'No access token found' || msg === 'Authentication required') {
      return { error: new Error('Unauthorized') }
    }
    /** Do not sign out — transient / network; avoid kicking user back to login after successful sign-in. */
    console.warn('ensureConsumerMobileAccess:', msg)
    return { error: e instanceof Error ? e : new Error('Sign-in validation failed') }
  }
}

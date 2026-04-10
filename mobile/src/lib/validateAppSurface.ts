import { supabase } from './supabase'
import { apiRequest } from './apiClient'

/** Enforces mobile-only accounts (and blocks org / office-admin identities). */
export async function ensureConsumerMobileAccess(): Promise<{ error: Error | null }> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    /** `apiRequest` requires a token; without it we throw — avoid that and skip sign-out churn after SIGNED_OUT. */
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
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      await supabase.auth.signOut()
      return {
        error: new Error(
          typeof data.error === 'string' ? data.error : 'This account cannot use the Easner mobile app.',
        ),
      }
    }
    return { error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'No access token found' || msg === 'Authentication required') {
      return { error: new Error('Unauthorized') }
    }
    await supabase.auth.signOut()
    return { error: e instanceof Error ? e : new Error('Sign-in validation failed') }
  }
}

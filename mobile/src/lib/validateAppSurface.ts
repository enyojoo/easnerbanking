import { supabase } from './supabase'
import { apiRequest } from './apiClient'

/** Enforces mobile-only accounts (and blocks org / office-admin identities). */
export async function ensureConsumerMobileAccess(): Promise<{ error: Error | null }> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const res = await apiRequest('/api/auth/validate-app-surface', {
      method: 'POST',
      body: JSON.stringify({
        surface: 'consumer_mobile',
        ...(session?.access_token ? { accessToken: session.access_token } : {}),
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
    await supabase.auth.signOut()
    return { error: e instanceof Error ? e : new Error('Sign-in validation failed') }
  }
}

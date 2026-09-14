import { getSessionReliable } from './authSession'
import { apiRequest } from './apiClient'

export type SurfaceAccessFailureKind = 'unauthorized' | 'denied' | 'transient'

export type SurfaceAccessResult = {
  error: Error | null
  kind?: SurfaceAccessFailureKind
  code?: string
  status?: number
}

/** Enforces mobile-only accounts (and blocks org / office-admin identities). */
export async function ensureConsumerMobileAccess(): Promise<SurfaceAccessResult> {
  try {
    const session = await getSessionReliable()
    /** Transient while SecureStore/AsyncStorage hydrates – caller must not treat as "denied". */
    if (!session?.access_token) {
      return { error: new Error('Unauthorized'), kind: 'unauthorized' }
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
      const message =
        typeof data.error === 'string'
          ? data.error
          : 'This account cannot use the Easner mobile app.'
      if (res.status === 401) {
        return { error: new Error('Unauthorized'), kind: 'unauthorized', code: data.code, status: res.status }
      }
      if (res.status === 403) {
        return {
          error: new Error(message),
          kind: 'denied',
          code: data.code,
          status: res.status,
        }
      }
      /** Server / gateway errors must not revoke the local session. */
      console.warn('ensureConsumerMobileAccess: non-fatal HTTP', res.status, data.code ?? '')
      return { error: null, kind: 'transient', status: res.status }
    }
    return { error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'No access token found' || msg === 'Authentication required') {
      return { error: new Error('Unauthorized'), kind: 'unauthorized' }
    }
    /** Do not sign out – transient / network; avoid kicking user back to login after successful sign-in. */
    console.warn('ensureConsumerMobileAccess:', msg)
    return { error: null, kind: 'transient' }
  }
}

export function isDefinitiveMobileSurfaceDenial(code?: string): boolean {
  return (
    code === 'ACCOUNT_CLOSED' ||
    code === 'WRONG_ROLE_FOR_MOBILE' ||
    code === 'OFFICE_ADMIN_WRONG_APP'
  )
}

export function isSessionPreservingSurfaceDenial(code?: string): boolean {
  return code === 'PLATFORM_MAINTENANCE'
}

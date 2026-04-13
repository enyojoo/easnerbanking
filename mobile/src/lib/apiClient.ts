import Constants from 'expo-constants'
import { supabase } from './supabase'

/**
 * Last-resort origin for release builds when `extra.apiUrl` / `EXPO_PUBLIC_API_URL` were not set at build time.
 * Prefer setting `EXPO_PUBLIC_API_URL` on EAS (staging vs production).
 */
/** Default BFF origin when env is missing (should match `EASNER_API_HOST` / Vercel `api.*` domain). */
export const EASNER_PUBLIC_APP_ORIGIN = 'https://api.easner.com'

/**
 * Business Next.js API (bootstrap, Noah proxy). Resolution order:
 * 1. `expo.extra.apiUrl` from app.config.js (EAS env / local .env at prebuild)
 * 2. `process.env.EXPO_PUBLIC_API_URL` (Metro inline)
 * 3. Dev: `http://localhost:3000`
 * 4. Release: {@link EASNER_PUBLIC_APP_ORIGIN} (warn once — same default as auth deep links elsewhere)
 */
export const getApiBaseUrl = (): string => {
  const fromExtra = Constants.expoConfig?.extra?.apiUrl
  if (typeof fromExtra === 'string' && fromExtra.trim()) {
    return fromExtra.replace(/\/$/, '')
  }

  const fromEnv = process.env.EXPO_PUBLIC_API_URL
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '')
  }

  if (__DEV__) {
    return 'http://localhost:3000'
  }

  console.warn(
    `[Easner] API base URL not in app config; using ${EASNER_PUBLIC_APP_ORIGIN}. Set EXPO_PUBLIC_API_URL on EAS for non-production backends.`
  )
  return EASNER_PUBLIC_APP_ORIGIN
}

/**
 * Same as business web `POST /api/auth/bootstrap` (Bearer + service-role upsert to public.users).
 * Call after session exists; `role: individual` skips org/country (no country on mobile).
 */
export async function ensureBusinessAppUserBootstrap(): Promise<void> {
  const apiBase = getApiBaseUrl()
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.access_token) return

    const fullName =
      typeof session.user.user_metadata?.name === 'string'
        ? session.user.user_metadata.name.trim()
        : null

    const res = await fetch(`${apiBase}/api/auth/bootstrap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        role: 'individual',
        fullName: fullName || undefined,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn('auth bootstrap failed:', res.status, text)
      return
    }
    /** Bootstrap may align `user_metadata.name` with `users.full_name` server-side — refresh JWT. */
    await supabase.auth.refreshSession().catch(() => undefined)
  } catch (e) {
    console.warn('auth bootstrap error:', e)
  }
}

/**
 * Make an authenticated API request
 * Automatically includes the Supabase access token in the Authorization header
 */
export const apiRequest = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> => {
  try {
    // Get current session to extract access token
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError) {
      console.error('Error getting session:', sessionError)
      throw new Error('Authentication required')
    }
    
    if (!session?.access_token) {
      throw new Error('No access token found')
    }
    
    // Build full URL (React Native has no document origin — never use host-relative URLs)
    const apiBase = getApiBaseUrl()
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${apiBase}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`
    
    // Prepare headers
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      ...options.headers,
    }
    
    // Make the request with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout
    
    try {
    const response = await fetch(url, {
      ...options,
      headers,
        signal: controller.signal,
    })
      clearTimeout(timeoutId)
    return response
    } catch (error: any) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        throw new Error('Network request timed out')
      }
      throw error
    }
  } catch (error: any) {
    // Handle network errors gracefully
    if (error?.message === 'Network request failed' || error?.name === 'TypeError' || error?.message?.includes('fetch')) {
      console.warn('API request failed (network error):', error?.message || 'Network unavailable')
      // Create a custom response object that indicates network failure
      // Use status 503 (Service Unavailable) to indicate network issues
      const errorResponse = new Response(
        JSON.stringify({ 
          error: 'Network request failed', 
          message: 'Unable to connect to server. Please check your internet connection.' 
        }),
        {
          status: 503,
          statusText: 'Network Error',
          headers: { 'Content-Type': 'application/json' },
        }
      )
      // Mark as network error for easy detection
      ;(errorResponse as any).isNetworkError = true
      return errorResponse
    }
    console.error('API request error:', error)
    throw error
  }
}

/** Noah ledger/API scope: mobile consumer flows use individual (personal wallet), not org terminal. */
export const NOAH_SCOPE_INDIVIDUAL_HEADERS = { 'X-Easner-Noah-Scope': 'individual' } as const

/**
 * Helper for GET requests (`init` merges into fetch options, e.g. extra headers).
 */
export const apiGet = async (endpoint: string, init?: RequestInit): Promise<Response> => {
  return apiRequest(endpoint, { method: 'GET', ...init })
}

/**
 * Helper for POST requests
 */
export const apiPost = async (endpoint: string, body?: any): Promise<Response> => {
  return apiRequest(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  })
}

/**
 * Helper for PATCH requests
 */
export const apiPatch = async (endpoint: string, body?: any): Promise<Response> => {
  return apiRequest(endpoint, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  })
}

/**
 * Helper for DELETE requests
 */
export const apiDelete = async (endpoint: string): Promise<Response> => {
  return apiRequest(endpoint, { method: 'DELETE' })
}


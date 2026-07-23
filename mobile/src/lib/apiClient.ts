import Constants from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'
import { PENDING_RESIDENCE_COUNTRY_KEY } from '../constants/residenceCountry'

/**
 * Last-resort API origin for release builds when `extra.apiUrl` / `EXPO_PUBLIC_API_URL`
 * were not set at build time. Prefer setting `EXPO_PUBLIC_API_URL` on EAS explicitly.
 */
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
 * Individual accounts may pass `countryCode` (ISO2 residence) from signup or pending storage.
 */
export async function ensureBusinessAppUserBootstrap(options?: {
  countryCode?: string
}): Promise<{ ok: boolean; status?: number; errorText?: string }> {
  const apiBase = getApiBaseUrl()
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.access_token) return { ok: false, errorText: 'No session' }

    const fullName =
      typeof session.user.user_metadata?.name === 'string'
        ? session.user.user_metadata.name.trim()
        : null

    let countryCode = options?.countryCode?.trim().toUpperCase()
    if (!countryCode) {
      try {
        const stored = await AsyncStorage.getItem(PENDING_RESIDENCE_COUNTRY_KEY)
        if (stored?.trim()) countryCode = stored.trim().toUpperCase()
      } catch {
        // ignore
      }
    }

    const res = await fetch(`${apiBase}/api/auth/bootstrap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        role: 'individual',
        fullName: fullName || undefined,
        countryCode: countryCode || undefined,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn('auth bootstrap failed:', res.status, text)
      return { ok: false, status: res.status, errorText: text }
    }

    const bootJson = (await res.json().catch(() => ({}))) as {
      turnkeySubOrgReady?: boolean
    }

    /** Bootstrap may align `user_metadata.name` with `users.full_name` server-side — refresh JWT. */
    await supabase.auth.refreshSession().catch(() => undefined)

    if (countryCode) {
      await AsyncStorage.removeItem(PENDING_RESIDENCE_COUNTRY_KEY).catch(() => undefined)
    }

    /** Retry ensure only when bootstrap did not link a Turnkey sub-org. */
    if (bootJson.turnkeySubOrgReady !== true) {
      try {
        const ensureRes = await fetch(`${apiBase}/api/wallets/ensure-sub-org`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
        })
        if (!ensureRes.ok) {
          const text = await ensureRes.text().catch(() => '')
          console.warn('ensure-sub-org after bootstrap:', ensureRes.status, text)
        }
      } catch (e) {
        console.warn('ensure-sub-org after bootstrap error:', e)
      }
    }
    return { ok: true }
  } catch (e) {
    console.warn('auth bootstrap error:', e)
    return { ok: false, errorText: e instanceof Error ? e.message : String(e) }
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

/** Noah ledger/API scope: mobile consumer flows default to individual (personal wallet). */
export const NOAH_SCOPE_INDIVIDUAL_HEADERS = { 'X-Easner-Noah-Scope': 'individual' } as const

export const NOAH_SCOPE_BUSINESS_HEADERS = { 'X-Easner-Noah-Scope': 'business' } as const

/** Mobile is consumer-only — always use individual Noah scope. */
export async function getNoahScopeHeaders(): Promise<typeof NOAH_SCOPE_INDIVIDUAL_HEADERS> {
  return NOAH_SCOPE_INDIVIDUAL_HEADERS
}

/**
 * Helper for GET requests (`init` merges into fetch options, e.g. extra headers).
 */
export const apiGet = async (endpoint: string, init?: RequestInit): Promise<Response> => {
  return apiRequest(endpoint, { method: 'GET', ...init })
}

/**
 * Helper for POST requests (`init` merges into fetch options, e.g. scope headers).
 */
export const apiPost = async (endpoint: string, body?: any, init?: RequestInit): Promise<Response> => {
  return apiRequest(endpoint, {
    ...init,
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


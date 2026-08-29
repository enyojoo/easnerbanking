import { Platform } from 'react-native'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { isAccessTokenFresh } from './authSessionFreshness'

export { ACCESS_TOKEN_EXPIRY_MARGIN_MS, isAccessTokenFresh } from './authSessionFreshness'

/**
 * Resolves the current Supabase session from memory + local storage only.
 *
 * Never calls `auth.getUser()` (GET /auth/v1/user) – that network round-trip was
 * slowing Expo web reload when storage hydration raced parallel API callers.
 *
 * Prefer this over raw `getSession()` when calling APIs right after sign-in or cold start.
 *
 * Access tokens that are expired or within {@link ACCESS_TOKEN_EXPIRY_MARGIN_MS} of
 * expiry are refreshed via `auth.refreshSession()` (not `getUser`) so Bearer calls
 * to the business API do not 401 after Safari/tab sleep.
 */

let cachedSession: Session | null = null
let sessionResolveInflight: Promise<Session | null> | null = null
let refreshInflight: Promise<Session | null> | null = null
let authCacheListenerInstalled = false

const WEB_RETRY_ATTEMPTS = 6
const NATIVE_RETRY_ATTEMPTS = 4
const RETRY_BASE_MS = Platform.OS === 'web' ? 40 : 75

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function installAuthSessionCacheListener(): void {
  if (authCacheListenerInstalled) return
  authCacheListenerInstalled = true
  supabase.auth.onAuthStateChange((_event, session) => {
    setAuthSessionCache(session)
  })
}

/** Keep in sync with GoTrue session events (INITIAL_SESSION, TOKEN_REFRESHED, SIGNED_OUT, …). */
export function setAuthSessionCache(session: Session | null): void {
  cachedSession = session?.access_token ? session : null
}

export function clearAuthSessionCache(): void {
  cachedSession = null
}

async function readSessionFromStorage(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) return null
  const session = data.session?.access_token ? data.session : null
  if (session) setAuthSessionCache(session)
  return session
}

async function resolveSessionReliable(): Promise<Session | null> {
  installAuthSessionCacheListener()

  if (cachedSession?.access_token) {
    return cachedSession
  }

  const first = await readSessionFromStorage()
  if (first?.access_token) {
    return first
  }

  const maxAttempts = Platform.OS === 'web' ? WEB_RETRY_ATTEMPTS : NATIVE_RETRY_ATTEMPTS
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await delay(RETRY_BASE_MS * (attempt + 1))
    if (cachedSession?.access_token) {
      return cachedSession
    }
    const session = await readSessionFromStorage()
    if (session?.access_token) {
      return session
    }
  }

  return cachedSession?.access_token ? cachedSession : null
}

/** Coalesced `refreshSession` so parallel `/api/*` callers share one GoTrue round-trip. */
export async function refreshAuthSession(): Promise<Session | null> {
  if (refreshInflight) return refreshInflight

  refreshInflight = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession()
      if (error) return cachedSession
      const session = data.session?.access_token ? data.session : null
      setAuthSessionCache(session)
      return session
    } catch {
      return cachedSession
    }
  })().finally(() => {
    refreshInflight = null
  })

  return refreshInflight
}

async function resolveFreshSession(): Promise<Session | null> {
  const session = await resolveSessionReliable()
  if (isAccessTokenFresh(session)) return session
  if (!session?.access_token) return session
  const refreshed = await refreshAuthSession()
  return refreshed?.access_token ? refreshed : session
}

export async function getSessionReliable(): Promise<Session | null> {
  if (isAccessTokenFresh(cachedSession)) {
    return cachedSession
  }
  if (sessionResolveInflight) {
    return sessionResolveInflight
  }

  sessionResolveInflight = resolveFreshSession().finally(() => {
    sessionResolveInflight = null
  })

  return sessionResolveInflight
}

/** User id from local session only – avoids GET /auth/v1/user. */
export async function getAuthUserId(userId?: string | null): Promise<string | null> {
  const trimmed = userId?.trim()
  if (trimmed) return trimmed
  const session = await getSessionReliable()
  return session?.user?.id ?? null
}

installAuthSessionCacheListener()

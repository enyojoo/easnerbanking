import Constants from 'expo-constants'
import { Platform } from 'react-native'
import Intercom from '@intercom/intercom-react-native'
import type { User } from '../types'
import { apiGet, getApiBaseUrl } from './apiClient'
import { supabase } from './supabase'

let lastSyncedKey: string | null = null
let loggedIntercomBuildHint = false

function logIntercomNativeError(context: string, e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e)
  console.warn(`[Intercom] ${context}:`, msg)
}

/** `created_at` in JWT must align with server-side minting (same user id + email). */
function signedUpAtFromUser(user: User): number | undefined {
  const c = user.created_at
  if (!c) return undefined
  const sec = Math.floor(Date.parse(c) / 1000)
  return Number.isNaN(sec) ? undefined : sec
}

function identityKey(user: User): string {
  const email = user.email?.trim() ?? ''
  return `${user.id}\u0000${email}\u0000${user.full_name ?? ''}`
}

/** Extract leading segment (`user.id`) from {@link identityKey}. */
function identityUserId(key: string | null): string | null {
  if (!key) return null
  const i = key.indexOf('\u0000')
  return i === -1 ? key : key.slice(0, i)
}

type JwtFetch = { token: string } | 'legacy' | 'unauth' | null

function parseJwtResponse(res: Response): JwtFetch {
  if ((res as { isNetworkError?: boolean }).isNetworkError) return null
  if (res.status === 503) return 'legacy'
  if (res.status === 401) return 'unauth'
  return null
}

/** Read JSON body when `res.ok`; otherwise caller already handled status. */
async function parseJwtBody(res: Response): Promise<{ token: string } | null> {
  try {
    const data = (await res.json()) as { token?: string }
    if (typeof data.token !== 'string') return null
    return { token: data.token }
  } catch {
    return null
  }
}

/**
 * Fetches a Messenger Security JWT from the business API.
 * - `503` = no `INTERCOM_MESSENGER_API_SECRET` (legacy Messenger).
 * - Retries once after `refreshSession` on 401 or a missing/invalid access token (stale session).
 * - `null` = network, server error, or auth still failing after refresh.
 */
async function fetchMessengerJwt(): Promise<{ token: string } | 'legacy' | null> {
  const doRequest = async (): Promise<JwtFetch> => {
    let res: Response
    try {
      res = await apiGet('/api/intercom/jwt')
    } catch {
      return 'unauth'
    }
    if (res.ok) {
      const body = await parseJwtBody(res)
      if (!body) {
        console.warn(
          `[Intercom] ${getApiBaseUrl()}/api/intercom/jwt returned 200 but JSON had no token string`,
        )
      }
      return body
    }
    const parsed = parseJwtResponse(res)
    if (parsed === null) {
      const isNet = Boolean((res as { isNetworkError?: boolean }).isNetworkError)
      if (isNet) {
        console.warn(
          `[Intercom] cannot reach ${getApiBaseUrl()}/api/intercom/jwt (network) — check device connectivity and EXPO_PUBLIC_API_URL`,
        )
      } else {
        console.warn(
          `[Intercom] ${getApiBaseUrl()}/api/intercom/jwt → HTTP ${res.status} (expected 200, or 401/503 for known paths)`,
        )
      }
    }
    if (parsed === 'legacy') {
      console.warn(
        `[Intercom] ${getApiBaseUrl()}/api/intercom/jwt → 503: INTERCOM_MESSENGER_API_SECRET missing on this deployment. Money/N Noah routes do not use this env — only this JWT route does.`,
      )
    }
    return parsed
  }

  let out = await doRequest()
  if (out === 'unauth') {
    const { data, error } = await supabase.auth.refreshSession()
    if (error || !data.session) {
      if (__DEV__) {
        console.warn(
          '[Intercom] Could not fetch Messenger JWT (unauthorized). After refresh:',
          error?.message ?? 'no session',
        )
      }
      return null
    }
    out = await doRequest()
  }
  if (out === 'unauth') {
    if (__DEV__) {
      console.warn('[Intercom] Messenger JWT still unauthorized after session refresh')
    }
    return null
  }
  return out
}

/**
 * Keeps Intercom aligned with the Supabase-backed user. Safe to call on every profile update.
 *
 * When the business API has `INTERCOM_MESSENGER_API_SECRET`, we fetch a JWT and call
 * `setUserJwt` before `loginUserWithUserAttributes` (Messenger Security).
 * @see https://developers.intercom.com/installing-intercom/react-native/using-intercom
 */
export async function syncIntercomIdentity(user: User | null): Promise<void> {
  if (Platform.OS === 'web') return

  try {
    if (!user?.id) {
      if (lastSyncedKey !== null) {
        await Intercom.logout()
        lastSyncedKey = null
      }
      return
    }

    const prevId = identityUserId(lastSyncedKey)
    if (prevId && prevId !== user.id) {
      await Intercom.logout()
      lastSyncedKey = null
    }

    const key = identityKey(user)
    const jwtState = await fetchMessengerJwt()

    if (jwtState === null) {
      console.warn(
        '[Intercom] Messenger JWT unavailable — user may see chat errors. Check EXPO_PUBLIC_API_URL, session, and INTERCOM_MESSENGER_API_SECRET on the API.',
      )
      return
    }

    if (jwtState === 'legacy') {
      let nativeOk = false
      try {
        nativeOk = await Intercom.isUserLoggedIn()
      } catch {
        nativeOk = false
      }
      if (lastSyncedKey === key && nativeOk) return

      const email = user.email?.trim()
      await Intercom.loginUserWithUserAttributes({
        userId: user.id,
        ...(email ? { email } : {}),
        ...(user.full_name?.trim() ? { name: user.full_name.trim() } : {}),
      })
      lastSyncedKey = key
      return
    }

    try {
      await Intercom.setUserJwt(jwtState.token)
    } catch (e) {
      logIntercomNativeError('setUserJwt failed', e)
      throw e
    }

    /**
     * Do not skip `loginUserWithUserAttributes` just because `lastSyncedKey` matches: after sign-out,
     * `Intercom.logout()` clears native state but a race or ordering bug can leave `lastSyncedKey` stale,
     * so we would only refresh JWT and never re-register — same “couldn’t load conversation” until reload.
     * If the native SDK reports not logged in, always run login again for this identity.
     */
    let nativeLoggedIn = false
    try {
      nativeLoggedIn = await Intercom.isUserLoggedIn()
    } catch {
      nativeLoggedIn = false
    }
    if (lastSyncedKey === key && nativeLoggedIn) {
      return
    }

    /**
     * After `setUserJwt`, register the user. Intercom iOS may return error 2001 if `userId`/`email` are missing
     * (`userAttributes` must include at least one). Match JWT claims: same `user_id`, optional `email`.
     * @see https://developers.intercom.com/installing-intercom/ios/error-codes/
     */
    const email = user.email?.trim()
    const su = signedUpAtFromUser(user)
    const attrs = {
      userId: user.id,
      ...(email ? { email } : {}),
      ...(su !== undefined ? { signedUpAt: su } : {}),
    }
    try {
      await Intercom.loginUserWithUserAttributes(attrs)
    } catch (e) {
      logIntercomNativeError('loginUserWithUserAttributes (JWT path) failed', e)
      throw e
    }
    lastSyncedKey = key
  } catch (e) {
    if (
      e instanceof Error &&
      e.message.includes('Intercom native module is not linked')
    ) {
      if (__DEV__) {
        console.warn('[Intercom]', e.message)
      }
      return
    }
    console.warn('[Intercom] syncIntercomIdentity failed:', e)
  }
}

/** Refresh JWT before opening chat so long sessions still have a valid token. */
async function refreshIntercomJwtIfConfigured(): Promise<void> {
  if (Platform.OS === 'web') return
  try {
    const jwtState = await fetchMessengerJwt()
    if (jwtState && jwtState !== 'legacy' && typeof jwtState === 'object') {
      await Intercom.setUserJwt(jwtState.token)
    }
  } catch {
    // non-fatal
  }
}

/**
 * Opens the Intercom Messenger (default Home space — includes Messages).
 * Avoids opening the Messages sub-space directly, which can show “couldn’t load your conversation” when the
 * session is still settling or a thread fails to hydrate.
 * Pass the signed-in `user` so identity and JWT are refreshed right before the UI opens.
 */
export async function presentIntercomMessenger(user?: User | null): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('LIVE_CHAT_UNAVAILABLE')
  }
  const extra = Constants.expoConfig?.extra as { intercomAppId?: string; intercomRegion?: string } | undefined
  if (extra?.intercomAppId && !loggedIntercomBuildHint) {
    loggedIntercomBuildHint = true
    console.warn(
      `[Intercom] native build app_id=${extra.intercomAppId} region=${extra?.intercomRegion ?? '?'} — must match Intercom workspace for INTERCOM_MESSENGER_API_SECRET + iOS SDK key`,
    )
  }
  if (user) {
    await syncIntercomIdentity(user)
  } else {
    await refreshIntercomJwtIfConfigured()
  }
  const loggedIn = await Intercom.isUserLoggedIn()
  if (!loggedIn) {
    console.warn(
      '[Intercom] isUserLoggedIn() is false after sync — not blocking open; if chat still fails, verify iOS/Android Messenger enabled in Intercom, and that JWT + native app_id/keys are the same workspace. API:',
      getApiBaseUrl(),
    )
  }
  try {
    await Intercom.present()
  } catch (e) {
    logIntercomNativeError('present() failed', e)
    throw new Error('LIVE_CHAT_UNAVAILABLE')
  }
}

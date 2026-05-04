import { Platform } from 'react-native'
import Intercom, { Space } from '@intercom/intercom-react-native'
import type { User } from '../types'
import { apiGet } from './apiClient'
import { supabase } from './supabase'

let lastSyncedKey: string | null = null

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
      return await parseJwtBody(res)
    }
    return parseJwtResponse(res)
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
      if (__DEV__) {
        console.warn('[Intercom] Could not fetch Messenger JWT — check session and EXPO_PUBLIC_API_URL')
      }
      return
    }

    if (jwtState === 'legacy') {
      if (lastSyncedKey === key) return

      const email = user.email?.trim()
      await Intercom.loginUserWithUserAttributes({
        userId: user.id,
        ...(email ? { email } : {}),
        ...(user.full_name?.trim() ? { name: user.full_name.trim() } : {}),
      })
      lastSyncedKey = key
      return
    }

    await Intercom.setUserJwt(jwtState.token)

    if (lastSyncedKey === key) {
      return
    }

    const email = user.email?.trim()
    await Intercom.loginUserWithUserAttributes({
      userId: user.id,
      ...(email ? { email } : {}),
      ...(user.full_name?.trim() ? { name: user.full_name.trim() } : {}),
    })
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
 * Opens the Intercom Messenger on the Messages space (live chat).
 * Pass the signed-in `user` so identity and JWT are refreshed right before the UI opens
 * (avoids race on cold start and expired access tokens).
 */
export async function presentIntercomMessenger(user?: User | null): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('Live chat is only available in the mobile app.')
  }
  if (user) {
    await syncIntercomIdentity(user)
  } else {
    await refreshIntercomJwtIfConfigured()
  }
  await Intercom.presentSpace(Space.messages)
}

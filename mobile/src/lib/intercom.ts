import { Platform } from 'react-native'
import Intercom, { Space } from '@intercom/intercom-react-native'
import type { User } from '../types'
import { apiGet } from './apiClient'

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

/**
 * `503` = backend has no `INTERCOM_MESSENGER_API_SECRET` (legacy Messenger).
 * `null` = auth/network/parsing failure — caller should skip or non-fatal continue.
 */
async function fetchMessengerJwt(): Promise<{ token: string } | 'legacy' | null> {
  const res = await apiGet('/api/intercom/jwt')
  if ((res as { isNetworkError?: boolean }).isNetworkError) return null
  if (res.status === 503) return 'legacy'
  if (!res.ok) return null
  let data: { token?: string }
  try {
    data = (await res.json()) as { token?: string }
  } catch {
    return null
  }
  if (typeof data.token !== 'string') return null
  return { token: data.token }
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

/** Opens the Intercom Messenger on the Messages space (live chat). */
export async function presentIntercomMessenger(): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('Live chat is only available in the mobile app.')
  }
  await refreshIntercomJwtIfConfigured()
  await Intercom.presentSpace(Space.messages)
}

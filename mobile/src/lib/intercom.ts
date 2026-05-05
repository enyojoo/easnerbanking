import { Platform } from 'react-native'
import Constants from 'expo-constants'
import type { Session } from '@supabase/supabase-js'
import Intercom, { Visibility } from '@intercom/intercom-react-native'
import { supabase } from './supabase'
import { getApiBaseUrl } from './apiClient'

type IntercomExtra = {
  intercomConfigured?: boolean
  intercomAppId?: string
  intercomIosApiKey?: string
  intercomAndroidApiKey?: string
}

function intercomExtra(): IntercomExtra | undefined {
  return Constants.expoConfig?.extra as IntercomExtra | undefined
}

export async function ensureIntercomInitialized(): Promise<boolean> {
  const extra = intercomExtra()
  if (!extra?.intercomConfigured || !extra.intercomAppId) return false

  const apiKey =
    Platform.OS === 'ios'
      ? extra.intercomIosApiKey
      : Platform.OS === 'android'
        ? extra.intercomAndroidApiKey
        : undefined
  if (!apiKey) return false

  try {
    await Intercom.initialize(apiKey, extra.intercomAppId)
    return true
  } catch (e) {
    console.warn('[Intercom] initialize failed', e)
    return false
  }
}

async function fetchIntercomMessengerJwt(accessToken: string): Promise<string | null> {
  try {
    const base = getApiBaseUrl()
    const res = await fetch(`${base}/api/intercom/jwt`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { token?: string }
    return typeof data.token === 'string' ? data.token : null
  } catch (e) {
    console.warn('[Intercom] JWT fetch failed', e)
    return null
  }
}

/**
 * Sync Intercom identity with Supabase session.
 * Messenger Security: call `setUserJwt` before `loginUserWithUserAttributes` (fresh JWT on each sync).
 * Launcher stays hidden — Support screen opens the messenger via `presentIntercomMessenger`.
 */
export async function syncIntercomSession(session: Session | null): Promise<void> {
  const extra = intercomExtra()
  if (!extra?.intercomConfigured) return

  const ok = await ensureIntercomInitialized()
  if (!ok) return

  try {
    if (session?.user) {
      const jwt = await fetchIntercomMessengerJwt(session.access_token)
      if (!jwt) {
        console.warn('[Intercom] No messenger JWT — check business INTERCOM_MESSENGER_API_SECRET and /api/intercom/jwt')
        return
      }
      await Intercom.setUserJwt(jwt)
      await Intercom.loginUserWithUserAttributes({
        userId: session.user.id,
        ...(session.user.email ? { email: session.user.email } : {}),
      })
    } else {
      await Intercom.logout().catch(() => undefined)
      await Intercom.loginUnidentifiedUser()
    }
    await Intercom.setLauncherVisibility(Visibility.GONE)
  } catch (e) {
    console.warn('[Intercom] syncIntercomSession failed', e)
  }
}

/**
 * Present messenger with an up-to-date JWT when logged in (fixes JWT::ExpiredSignature).
 */
export async function presentIntercomMessenger(): Promise<void> {
  const extra = intercomExtra()
  if (!extra?.intercomConfigured) {
    throw new Error('INTERCOM_NOT_CONFIGURED')
  }

  const ok = await ensureIntercomInitialized()
  if (!ok) throw new Error('INTERCOM_NOT_CONFIGURED')

  const {
    data: { session },
  } = await supabase.auth.getSession()

  try {
    if (session?.user) {
      const jwt = await fetchIntercomMessengerJwt(session.access_token)
      if (!jwt) {
        throw new Error('INTERCOM_JWT_UNAVAILABLE')
      }
      await Intercom.setUserJwt(jwt)
      await Intercom.loginUserWithUserAttributes({
        userId: session.user.id,
        ...(session.user.email ? { email: session.user.email } : {}),
      })
    } else {
      await Intercom.logout().catch(() => undefined)
      await Intercom.loginUnidentifiedUser()
    }
    await Intercom.present()
  } catch (e) {
    if (e instanceof Error && e.message === 'INTERCOM_JWT_UNAVAILABLE') throw e
    console.warn('[Intercom] present failed', e)
    throw e
  }
}

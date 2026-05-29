import { Platform } from 'react-native'
import Constants from 'expo-constants'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { getApiBaseUrl } from './apiClient'
import { isExpoGo } from './expoGo'

type IntercomModule = typeof import('@intercom/intercom-react-native')

let intercomLazy: IntercomModule | null | undefined
let intercomInitialized = false
let intercomIdentityReady = false
let syncIntercomSessionPromise: Promise<void> | null = null
let presentIntercomMessengerPromise: Promise<void> | null = null
let lastIntercomUserId: string | null = null

function getIntercom(): IntercomModule | null {
  if (isExpoGo) return null

  const extra = intercomExtra()
  if (!extra?.intercomConfigured) return null

  if (intercomLazy === undefined) {
    try {
      intercomLazy = require('@intercom/intercom-react-native') as IntercomModule
    } catch {
      intercomLazy = null
    }
  }
  return intercomLazy
}

type IntercomExtra = {
  intercomConfigured?: boolean
  intercomAppId?: string
  intercomIosApiKey?: string
  intercomAndroidApiKey?: string
}

function intercomExtra(): IntercomExtra | undefined {
  return Constants.expoConfig?.extra as IntercomExtra | undefined
}

export function isIntercomConfiguredInApp(): boolean {
  const extra = intercomExtra()
  return Boolean(extra?.intercomConfigured && !isExpoGo && getIntercom())
}

/** Load native module + initialize SDK early so Support → Live Chat can present immediately. */
export function prefetchIntercomModule(): void {
  if (!intercomExtra()?.intercomConfigured || isExpoGo) return
  getIntercom()
  void ensureIntercomInitialized()
}

export async function ensureIntercomInitialized(): Promise<boolean> {
  if (intercomInitialized) return true

  const mod = getIntercom()
  if (!mod) return false

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
    await mod.default.initialize(apiKey, extra.intercomAppId)
    intercomInitialized = true
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

function refreshIntercomJwtInBackground(session: Session): void {
  void fetchIntercomMessengerJwt(session.access_token).then((jwt) => {
    if (!jwt) return
    const mod = getIntercom()
    if (!mod) return
    void mod.default.setUserJwt(jwt).catch(() => undefined)
  })
}

async function applyIntercomIdentity(session: Session | null): Promise<void> {
  const mod = getIntercom()
  if (!mod) return

  const ok = await ensureIntercomInitialized()
  if (!ok) return

  const { default: Intercom, Visibility } = mod

  if (session?.user) {
    const jwt = await fetchIntercomMessengerJwt(session.access_token)
    if (!jwt) {
      intercomIdentityReady = false
      throw new Error('INTERCOM_JWT_UNAVAILABLE')
    }
    await Intercom.setUserJwt(jwt)
    await Intercom.loginUserWithUserAttributes({
      userId: session.user.id,
      ...(session.user.email ? { email: session.user.email } : {}),
    })
    lastIntercomUserId = session.user.id
    intercomIdentityReady = true
  } else {
    await Intercom.logout().catch(() => undefined)
    await Intercom.loginUnidentifiedUser()
    lastIntercomUserId = null
    intercomIdentityReady = true
  }
  await Intercom.setLauncherVisibility(Visibility.GONE)
}

/**
 * Sync Intercom identity with Supabase session.
 * Messenger Security: call `setUserJwt` before `loginUserWithUserAttributes` (fresh JWT on each sync).
 * Launcher stays hidden — Support screen opens the messenger via `presentIntercomMessenger`.
 */
export async function syncIntercomSession(session: Session | null): Promise<void> {
  const extra = intercomExtra()
  if (!extra?.intercomConfigured) return
  prefetchIntercomModule()
  if (!getIntercom()) return

  if (syncIntercomSessionPromise) {
    await syncIntercomSessionPromise
    return
  }

  syncIntercomSessionPromise = (async () => {
    try {
      await applyIntercomIdentity(session)
    } catch (e) {
      if (e instanceof Error && e.message === 'INTERCOM_JWT_UNAVAILABLE') {
        console.warn(
          '[Intercom] No messenger JWT — check business INTERCOM_MESSENGER_API_SECRET and /api/intercom/jwt',
        )
        return
      }
      console.warn('[Intercom] syncIntercomSession failed', e)
    }
  })()

  try {
    await syncIntercomSessionPromise
  } finally {
    syncIntercomSessionPromise = null
  }
}

/** Warm Intercom while Support is visible so Live Chat can present on the first tap. */
export async function prepareIntercomMessenger(): Promise<void> {
  if (!isIntercomConfiguredInApp()) return
  prefetchIntercomModule()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  await syncIntercomSession(session)
}

async function ensureIntercomReadyToPresent(session: Session | null): Promise<typeof import('@intercom/intercom-react-native').default> {
  const extra = intercomExtra()
  if (!extra?.intercomConfigured) {
    throw new Error('INTERCOM_NOT_CONFIGURED')
  }
  if (isExpoGo || !getIntercom()) {
    throw new Error('INTERCOM_NOT_CONFIGURED')
  }

  const ok = await ensureIntercomInitialized()
  if (!ok) throw new Error('INTERCOM_NOT_CONFIGURED')

  const mod = getIntercom()
  if (!mod) throw new Error('INTERCOM_NOT_CONFIGURED')

  if (syncIntercomSessionPromise) {
    await syncIntercomSessionPromise
  }

  const userId = session?.user?.id ?? null
  const identityMatches = intercomIdentityReady && userId === lastIntercomUserId

  if (!identityMatches) {
    await applyIntercomIdentity(session)
  } else if (session?.user) {
    refreshIntercomJwtInBackground(session)
  }

  return mod.default
}

/**
 * Present messenger. When identity was warmed on login / Support mount, this calls native present immediately.
 */
export async function presentIntercomMessenger(): Promise<void> {
  if (presentIntercomMessengerPromise) {
    return presentIntercomMessengerPromise
  }

  presentIntercomMessengerPromise = (async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    try {
      const Intercom = await ensureIntercomReadyToPresent(session)
      await Intercom.present()
    } catch (e) {
      if (e instanceof Error && e.message === 'INTERCOM_JWT_UNAVAILABLE') throw e
      console.warn('[Intercom] present failed', e)
      throw e
    }
  })()

  try {
    await presentIntercomMessengerPromise
  } finally {
    presentIntercomMessengerPromise = null
  }
}

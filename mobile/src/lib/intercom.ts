import { Platform } from 'react-native'
import Constants from 'expo-constants'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { getApiBaseUrl } from './apiClient'
import { isExpoGo } from './expoGo'

type IntercomModule = typeof import('@intercom/intercom-react-native')
type WebIntercomModule = typeof import('@intercom/messenger-js-sdk')

let intercomLazy: IntercomModule | null | undefined
let webIntercomLazy: WebIntercomModule | null | undefined
let webIntercomBooted = false
let intercomInitialized = false
let intercomIdentityReady = false
let warmIntercomMessengerPromise: Promise<boolean> | null = null
let presentIntercomMessengerPromise: Promise<void> | null = null
let lastIntercomUserId: string | null = null
let cachedMessengerJwt: { token: string; userId: string; fetchedAt: number } | null = null

/**
 * Reuse JWT across warm + present so Support chat does not block on a new network round-trip.
 * Must stay below server `expiresIn` in `business/app/api/intercom/jwt/route.ts` (24h).
 */
const MESSENGER_JWT_CACHE_MS = 23 * 60 * 60_000

function getIntercom(): IntercomModule | null {
  if (Platform.OS === 'web' || isExpoGo) return null

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

function getWebIntercom(): WebIntercomModule | null {
  if (Platform.OS !== 'web') return null
  const extra = intercomExtra()
  if (!extra?.intercomConfigured || !extra.intercomAppId) return null
  if (webIntercomLazy === undefined) {
    try {
      webIntercomLazy = require('@intercom/messenger-js-sdk') as WebIntercomModule
    } catch {
      webIntercomLazy = null
    }
  }
  return webIntercomLazy
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

function clearIntercomIdentityCache(): void {
  intercomIdentityReady = false
  lastIntercomUserId = null
  cachedMessengerJwt = null
}

export function isIntercomConfiguredInApp(): boolean {
  const extra = intercomExtra()
  if (Platform.OS === 'web') {
    return Boolean(extra?.intercomConfigured && extra?.intercomAppId && getWebIntercom())
  }
  return Boolean(extra?.intercomConfigured && !isExpoGo && getIntercom())
}

/** Load native module + initialize SDK early so Support → Live Chat can present immediately. */
export function prefetchIntercomModule(): void {
  if (!intercomExtra()?.intercomConfigured) return
  if (Platform.OS === 'web') {
    getWebIntercom()
    if (!warmIntercomMessengerPromise) {
      void warmIntercomMessenger()
    }
    return
  }
  if (isExpoGo) return
  getIntercom()
  void ensureIntercomInitialized()
  if (!warmIntercomMessengerPromise) {
    void warmIntercomMessenger()
  }
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

async function resolveMessengerJwt(
  accessToken: string,
  userId: string,
  forceRefresh = false,
): Promise<string | null> {
  if (
    !forceRefresh &&
    cachedMessengerJwt &&
    cachedMessengerJwt.userId === userId &&
    Date.now() - cachedMessengerJwt.fetchedAt < MESSENGER_JWT_CACHE_MS
  ) {
    return cachedMessengerJwt.token
  }

  const jwt = await fetchIntercomMessengerJwt(accessToken)
  if (jwt) {
    cachedMessengerJwt = { token: jwt, userId, fetchedAt: Date.now() }
  }
  return jwt
}

function refreshIntercomJwtInBackground(session: Session): void {
  void resolveMessengerJwt(session.access_token, session.user.id, true).then((jwt) => {
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
    const userId = session.user.id
    const jwt = await resolveMessengerJwt(session.access_token, userId)
    if (!jwt) {
      clearIntercomIdentityCache()
      throw new Error('INTERCOM_JWT_UNAVAILABLE')
    }
    await Intercom.setUserJwt(jwt)
    await Intercom.loginUserWithUserAttributes({
      userId,
      ...(session.user.email ? { email: session.user.email } : {}),
    })
    lastIntercomUserId = userId
    intercomIdentityReady = true
  } else {
    clearIntercomIdentityCache()
    await Intercom.logout().catch(() => undefined)
    await Intercom.loginUnidentifiedUser()
    lastIntercomUserId = null
    intercomIdentityReady = true
  }
  await Intercom.setLauncherVisibility(Visibility.GONE)
}

/**
 * Initialize SDK + identity once (shared by login sync, PIN unlock, Support mount, and present).
 * Returns true when messenger can be presented without another JWT/login pass.
 */
async function bootWebIntercom(session: Session | null): Promise<boolean> {
  const mod = getWebIntercom()
  const extra = intercomExtra()
  if (!mod || !extra?.intercomAppId) return false

  const Intercom = mod.default
  if (!session?.user) {
    webIntercomBooted = false
    return false
  }

  const jwt = await resolveMessengerJwt(session.access_token, session.user.id)
  if (!jwt) return false

  if (!webIntercomBooted) {
    Intercom({
      app_id: extra.intercomAppId,
      intercom_user_jwt: jwt,
      hide_default_launcher: true,
      session_duration: 86_400_000,
    })
    webIntercomBooted = true
  } else {
    mod.update({
      intercom_user_jwt: jwt,
      hide_default_launcher: true,
      session_duration: 86_400_000,
    })
  }

  lastIntercomUserId = session.user.id
  intercomIdentityReady = true
  intercomInitialized = true
  return true
}

async function warmIntercomMessenger(session?: Session | null): Promise<boolean> {
  const extra = intercomExtra()
  if (!extra?.intercomConfigured) return false

  if (Platform.OS === 'web') {
    if (warmIntercomMessengerPromise) return warmIntercomMessengerPromise
    warmIntercomMessengerPromise = (async () => {
      let resolvedSession = session
      if (resolvedSession === undefined) {
        const {
          data: { session: current },
        } = await supabase.auth.getSession()
        resolvedSession = current
      }
      try {
        return await bootWebIntercom(resolvedSession)
      } catch (e) {
        console.warn('[Intercom] warmWebIntercom failed', e)
        return false
      }
    })()
    try {
      return await warmIntercomMessengerPromise
    } finally {
      warmIntercomMessengerPromise = null
    }
  }

  if (isExpoGo || !getIntercom()) return false

  if (intercomIdentityReady && intercomInitialized) {
    const userId = session?.user?.id ?? null
    if (userId === lastIntercomUserId || (!userId && lastIntercomUserId === null)) {
      return true
    }
  }

  if (warmIntercomMessengerPromise) {
    return warmIntercomMessengerPromise
  }

  warmIntercomMessengerPromise = (async () => {
    prefetchIntercomModule()
    let resolvedSession = session
    if (resolvedSession === undefined) {
      const {
        data: { session: current },
      } = await supabase.auth.getSession()
      resolvedSession = current
    }

    try {
      await applyIntercomIdentity(resolvedSession)
      return intercomIdentityReady
    } catch (e) {
      if (e instanceof Error && e.message === 'INTERCOM_JWT_UNAVAILABLE') {
        console.warn(
          '[Intercom] No messenger JWT — check business INTERCOM_MESSENGER_API_SECRET and /api/intercom/jwt',
        )
        return false
      }
      console.warn('[Intercom] warmIntercomMessenger failed', e)
      return false
    }
  })()

  try {
    return await warmIntercomMessengerPromise
  } finally {
    warmIntercomMessengerPromise = null
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
  await warmIntercomMessenger(session)
}

/** Warm Intercom while Support is visible so Live Chat can present on the first tap. */
export async function prepareIntercomMessenger(): Promise<void> {
  if (!isIntercomConfiguredInApp()) return
  await warmIntercomMessenger()
}

/**
 * Present messenger. When warmed on login / PIN unlock / Support mount, this should only call native present.
 */
export async function presentIntercomMessenger(): Promise<void> {
  if (presentIntercomMessengerPromise) {
    return presentIntercomMessengerPromise
  }

  presentIntercomMessengerPromise = (async () => {
    const extra = intercomExtra()
    if (!extra?.intercomConfigured) {
      throw new Error('INTERCOM_NOT_CONFIGURED')
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (Platform.OS === 'web') {
      const webMod = getWebIntercom()
      if (!webMod) throw new Error('INTERCOM_NOT_CONFIGURED')
      const ready = await warmIntercomMessenger(session)
      if (!ready) throw new Error('INTERCOM_JWT_UNAVAILABLE')
      webMod.show()
      return
    }

    if (isExpoGo || !getIntercom()) {
      throw new Error('INTERCOM_NOT_CONFIGURED')
    }

    const ready = await warmIntercomMessenger(session)
    if (!ready) {
      const ok = await ensureIntercomInitialized()
      if (!ok) throw new Error('INTERCOM_NOT_CONFIGURED')
      throw new Error('INTERCOM_JWT_UNAVAILABLE')
    }

    const mod = getIntercom()
    if (!mod) throw new Error('INTERCOM_NOT_CONFIGURED')

    try {
      await mod.default.present()
      if (session?.user) {
        refreshIntercomJwtInBackground(session)
      }
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

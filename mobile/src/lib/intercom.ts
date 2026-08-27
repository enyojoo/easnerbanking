import { Alert, Platform } from 'react-native'
import Constants from 'expo-constants'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { getApiBaseUrl } from './apiClient'
import { isExpoGo } from './expoGo'
import { intercomJwtPayloadFromUser } from './intercomUserAttributes'

declare global {
  interface Window {
    Intercom?: (...args: unknown[]) => unknown
  }
}

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
  if (!extra?.intercomAppId) return null
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
  intercomRegion?: string
}

type IntercomRegion = 'us' | 'eu' | 'ap'

type IntercomAuthResult =
  | { ok: true; mode: 'jwt'; token: string }
  | { ok: true; mode: 'legacy' }
  | { ok: false; status: number }

let webIntercomReady = false
let webIntercomReadyWaiters: Array<() => void> = []
let webHideListenerRegistered = false
let webIntercomStyleInjected = false

function parseIntercomRegion(raw: string | undefined): IntercomRegion {
  const r = (raw ?? 'us').trim().toLowerCase()
  if (r === 'eu') return 'eu'
  if (r === 'ap' || r === 'au') return 'ap'
  return 'us'
}

function markWebIntercomReady(): void {
  webIntercomReady = true
  for (const resolve of webIntercomReadyWaiters) resolve()
  webIntercomReadyWaiters = []
}

function markWebIntercomNotReady(): void {
  webIntercomReady = false
}

function whenWebIntercomReady(timeoutMs = 8_000): Promise<boolean> {
  if (webIntercomReady) return Promise.resolve(true)
  if (typeof window === 'undefined') return Promise.resolve(false)

  return new Promise((resolve) => {
    const done = () => {
      webIntercomReadyWaiters = webIntercomReadyWaiters.filter((fn) => fn !== onReady)
      resolve(webIntercomReady)
    }
    const onReady = () => done()
    webIntercomReadyWaiters.push(onReady)
    window.setTimeout(() => {
      webIntercomReadyWaiters = webIntercomReadyWaiters.filter((fn) => fn !== onReady)
      resolve(webIntercomReady)
    }, timeoutMs)
  })
}

function ensureWebIntercomStyles(): void {
  if (webIntercomStyleInjected || typeof document === 'undefined') return
  webIntercomStyleInjected = true
  const style = document.createElement('style')
  style.id = 'easner-intercom-zfix'
  style.textContent = `
    #intercom-container,
    .intercom-lightweight-app,
    iframe[name="intercom-messenger-frame"] {
      z-index: 2147483000 !important;
    }
  `
  document.head.appendChild(style)
}

function isWindowIntercomReady(): boolean {
  return typeof window !== 'undefined' && typeof window.Intercom === 'function'
}

async function waitForWindowIntercom(timeoutMs = 8_000): Promise<boolean> {
  if (isWindowIntercomReady()) return true
  if (typeof window === 'undefined') return false
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 50))
    if (isWindowIntercomReady()) return true
  }
  return false
}

function shutdownWebIntercomIfReady(mod: WebIntercomModule): void {
  if (!isWindowIntercomReady()) return
  try {
    mod.shutdown()
  } catch (e) {
    console.warn('[Intercom] shutdown failed', e)
  }
}

function registerWebIntercomHideOnClose(): void {
  const mod = getWebIntercom()
  if (!mod || webHideListenerRegistered || !isWindowIntercomReady()) return
  webHideListenerRegistered = true
  mod.onHide(() => {
    if (isWindowIntercomReady()) mod.hide()
  })
}

function resetWebIntercomSession(): void {
  webIntercomBooted = false
  webHideListenerRegistered = false
  markWebIntercomNotReady()
  lastIntercomUserId = null
  intercomIdentityReady = false
  intercomInitialized = false
}

function intercomExtra(): IntercomExtra | undefined {
  return Constants.expoConfig?.extra as IntercomExtra | undefined
}

function isIntercomEnabled(): boolean {
  const extra = intercomExtra()
  if (Platform.OS === 'web') return Boolean(extra?.intercomAppId)
  return Boolean(extra?.intercomConfigured)
}

function clearIntercomIdentityCache(): void {
  intercomIdentityReady = false
  lastIntercomUserId = null
  cachedMessengerJwt = null
}

export function isIntercomConfiguredInApp(): boolean {
  const extra = intercomExtra()
  if (Platform.OS === 'web') {
    return Boolean(extra?.intercomAppId && getWebIntercom())
  }
  return Boolean(extra?.intercomConfigured && !isExpoGo && getIntercom())
}

/** Load native module + initialize SDK early so Support → Live Chat can present immediately. */
export function prefetchIntercomModule(): void {
  if (!isIntercomEnabled()) return
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

async function fetchIntercomAuth(accessToken: string): Promise<IntercomAuthResult> {
  try {
    const base = getApiBaseUrl()
    const res = await fetch(`${base}/api/intercom/jwt`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    })
    if (res.status === 503) return { ok: true, mode: 'legacy' }
    if (res.status === 401) return { ok: false, status: 401 }
    if (!res.ok) return { ok: false, status: res.status }
    const data = (await res.json()) as { token?: string }
    if (typeof data.token !== 'string') return { ok: false, status: 500 }
    return { ok: true, mode: 'jwt', token: data.token }
  } catch (e) {
    console.warn('[Intercom] auth fetch failed', e)
    return { ok: false, status: 0 }
  }
}

async function fetchIntercomMessengerJwt(accessToken: string): Promise<string | null> {
  const auth = await fetchIntercomAuth(accessToken)
  if (auth.ok && auth.mode === 'jwt') return auth.token
  return null
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
function buildWebBootPayload(
  appId: string,
  region: IntercomRegion,
  user: User,
  auth: Extract<IntercomAuthResult, { ok: true }>,
) {
  const base = {
    app_id: appId,
    region,
    hide_default_launcher: true,
    session_duration: 86_400_000,
  }
  if (auth.mode === 'jwt') {
    return {
      ...base,
      intercom_user_jwt: auth.token,
    }
  }
  return {
    ...base,
    ...intercomJwtPayloadFromUser(user),
  }
}

function buildWebUpdatePayload(user: User, auth: Extract<IntercomAuthResult, { ok: true }>) {
  if (auth.mode === 'jwt') {
    return {
      intercom_user_jwt: auth.token,
      hide_default_launcher: true,
      session_duration: 86_400_000,
    }
  }
  return {
    ...intercomJwtPayloadFromUser(user),
    hide_default_launcher: true,
  }
}

async function bootWebIntercom(session: Session | null, options?: { updateOnly?: boolean }): Promise<boolean> {
  const mod = getWebIntercom()
  const extra = intercomExtra()
  if (!mod || !extra?.intercomAppId) return false

  const Intercom = mod.default
  if (!session?.user) {
    shutdownWebIntercomIfReady(mod)
    resetWebIntercomSession()
    return false
  }

  const auth = await fetchIntercomAuth(session.access_token)
  if (!auth.ok) {
    console.warn('[Intercom] web auth unavailable', auth.status)
    return false
  }

  if (auth.mode === 'jwt') {
    cachedMessengerJwt = {
      token: auth.token,
      userId: session.user.id,
      fetchedAt: Date.now(),
    }
  }

  const region = parseIntercomRegion(extra.intercomRegion)
  const updateOnly = options?.updateOnly === true && webIntercomBooted

  ensureWebIntercomStyles()

  if (updateOnly && lastIntercomUserId === session.user.id) {
    if (isWindowIntercomReady()) {
      mod.update(buildWebUpdatePayload(session.user, auth))
    }
    markWebIntercomReady()
    return true
  }

  if (webIntercomBooted && lastIntercomUserId && lastIntercomUserId !== session.user.id) {
    shutdownWebIntercomIfReady(mod)
    resetWebIntercomSession()
  }

  Intercom(buildWebBootPayload(extra.intercomAppId, region, session.user, auth))
  const widgetReady = await waitForWindowIntercom()
  if (!widgetReady) {
    console.warn('[Intercom] web widget did not become ready')
    return false
  }
  registerWebIntercomHideOnClose()
  webIntercomBooted = true
  if (isWindowIntercomReady()) mod.hide()
  markWebIntercomReady()

  lastIntercomUserId = session.user.id
  intercomIdentityReady = true
  intercomInitialized = true
  return true
}

/** Web-only: boot or update Intercom for the signed-in user (used by `WebIntercomMessenger`). */
export async function syncWebIntercomForUser(
  session: Session | null,
  options?: { updateOnly?: boolean },
): Promise<void> {
  if (Platform.OS !== 'web') return
  await bootWebIntercom(session, options)
}

async function warmIntercomMessenger(session?: Session | null): Promise<boolean> {
  if (!isIntercomEnabled()) return false

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
          '[Intercom] No messenger JWT – check business INTERCOM_MESSENGER_API_SECRET and /api/intercom/jwt',
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
 * Launcher stays hidden – Support screen opens the messenger via `presentIntercomMessenger`.
 */
export async function syncIntercomSession(session: Session | null): Promise<void> {
  if (!isIntercomEnabled()) return
  if (Platform.OS === 'web') {
    await syncWebIntercomForUser(session, {
      updateOnly: Boolean(session?.user && lastIntercomUserId === session.user.id),
    })
    return
  }
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
    if (!isIntercomEnabled()) {
      throw new Error('INTERCOM_NOT_CONFIGURED')
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (Platform.OS === 'web') {
      const webMod = getWebIntercom()
      if (!webMod) throw new Error('INTERCOM_NOT_CONFIGURED')
      if (!webIntercomReady) {
        const booted = await bootWebIntercom(session)
        if (!booted) throw new Error('INTERCOM_JWT_UNAVAILABLE')
      }
      const messengerReady = await whenWebIntercomReady()
      if (!messengerReady) throw new Error('INTERCOM_NOT_READY')
      const widgetReady = await waitForWindowIntercom()
      if (!widgetReady || !isWindowIntercomReady()) throw new Error('INTERCOM_NOT_READY')
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

export function intercomPresentErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === 'INTERCOM_NOT_CONFIGURED') {
    return 'Live chat is not available in this build. Set EXPO_PUBLIC_INTERCOM_APP_ID and rebuild, or use email support.'
  }
  if (error instanceof Error && error.message === 'INTERCOM_JWT_UNAVAILABLE') {
    return 'Could not open live chat. Check your connection and that the Easner API can authenticate Intercom (INTERCOM_MESSENGER_API_SECRET on the server).'
  }
  if (error instanceof Error && error.message === 'INTERCOM_NOT_READY') {
    return 'Chat is still loading. Wait a moment and try again, or use email support.'
  }
  return 'Could not open chat. Please try again or use email support.'
}

export function alertIntercomError(title: string, message: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`)
    return
  }
  Alert.alert(title, message)
}

import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  coalesceExpressSavedPaymentMethods,
  expressDepositsPersistStatus,
  expressDepositsStatusIsReady,
  keepExpressDepositsCachedNextStep,
  keepExpressDepositsCachedReady,
  type ExpressDepositsNextStep,
  type ExpressSavedPaymentMethods,
} from '@easner/shared'
import { apiFetch } from '../query/api-client'
import { prefetchMobileExpressOnramp } from './express-onramp'

export type ExpressOnrampStatus = {
  ready?: boolean
  status?: string
  nextStep?: ExpressDepositsNextStep
  publishableKey?: string
  prefill?: Record<string, unknown>
  payerCountry?: string | null
  sourceCurrency?: string | null
  eligible?: boolean
  cryptoCustomerId?: string | null
  methods?: string[]
  paymentMethods?: ExpressSavedPaymentMethods
  kycTiers?: unknown[]
  office?: { stripeOnrampEnabled?: boolean; stripeOnrampEuEnabled?: boolean }
}

const LS_KEY = 'express_onramp_status_v1'
const LS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

let cached: ExpressOnrampStatus | null = null
let inflight: Promise<ExpressOnrampStatus> | null = null
const listeners = new Set<() => void>()

function readWebPersisted(): ExpressOnrampStatus | null {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { data?: ExpressOnrampStatus; timestamp?: number }
    const ts = typeof parsed.timestamp === 'number' ? parsed.timestamp : 0
    if (!parsed.data || Date.now() - ts > LS_MAX_AGE_MS) return null
    return parsed.data
  } catch {
    return null
  }
}

function writePersisted(data: ExpressOnrampStatus) {
  const payload = JSON.stringify({ data, timestamp: Date.now() })
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(LS_KEY, payload)
    } catch {
      // ignore quota / private mode
    }
  }
  void AsyncStorage.setItem(LS_KEY, payload).catch(() => undefined)
}

function applyCache(data: ExpressOnrampStatus) {
  const keepReady = keepExpressDepositsCachedReady({
    cachedReady: expressDepositsStatusIsReady(cached),
    incoming: {
      ready: data.ready,
      status: data.status,
      eligible: data.eligible,
      kycTiers: data.kycTiers,
      cryptoCustomerId: data.cryptoCustomerId,
    },
  })
  const incoming: ExpressOnrampStatus = keepReady
    ? { ...data, ready: true, status: 'ready', nextStep: 'ready' }
    : data
  const nextStep =
    keepExpressDepositsCachedNextStep({
      cached: cached?.nextStep,
      incoming: incoming.nextStep,
      incomingKycTiers: incoming.kycTiers,
      incomingEligible: incoming.eligible,
    }) ?? incoming.nextStep
  const merged: ExpressOnrampStatus = {
    ...incoming,
    nextStep,
    status: nextStep ? expressDepositsPersistStatus(nextStep) : incoming.status,
    ready: nextStep === 'ready' || incoming.ready,
    paymentMethods: coalesceExpressSavedPaymentMethods(incoming.paymentMethods, cached?.paymentMethods),
  }
  cached = merged
  writePersisted(merged)
  for (const listener of listeners) listener()
  return merged
}

export function patchExpressOnrampStatus(patch: Partial<ExpressOnrampStatus>) {
  const current = peekExpressOnrampStatus() || {}
  return applyCache({ ...current, ...patch })
}

export function peekExpressOnrampStatus(): ExpressOnrampStatus | null {
  if (cached) return cached
  const persisted = readWebPersisted()
  if (persisted) {
    cached = persisted
    return persisted
  }
  return cached
}

export function subscribeExpressOnrampStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function cacheExpressOnrampStatus(data: ExpressOnrampStatus) {
  applyCache(data)
}

export async function hydrateExpressOnrampStatus(): Promise<ExpressOnrampStatus | null> {
  if (cached) return cached
  const web = readWebPersisted()
  if (web) {
    cached = web
    return web
  }
  try {
    const raw = await AsyncStorage.getItem(LS_KEY)
    if (!raw) return cached
    const parsed = JSON.parse(raw) as { data?: ExpressOnrampStatus; timestamp?: number }
    const ts = typeof parsed.timestamp === 'number' ? parsed.timestamp : 0
    if (!parsed.data || Date.now() - ts > LS_MAX_AGE_MS) return cached
    if (!cached) {
      cached = parsed.data
      for (const listener of listeners) listener()
    }
  } catch {
    // ignore
  }
  return cached
}

function loadStatus(): Promise<ExpressOnrampStatus> {
  if (inflight) return inflight
  inflight = apiFetch<ExpressOnrampStatus>('/api/stripe/onramp/status')
    .then((data) => {
      const next = applyCache(data)
      // Script only — initializing the SDK here posts to controller.html and 403s on Add money.
      prefetchMobileExpressOnramp()
      return next
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function fetchExpressOnrampStatus(force = false): Promise<ExpressOnrampStatus> {
  const hit = peekExpressOnrampStatus()
  if (!force && hit) {
    void loadStatus().catch(() => undefined)
    return Promise.resolve(hit)
  }
  return loadStatus()
}

export function warmExpressOnrampStatus() {
  void hydrateExpressOnrampStatus().then(() => loadStatus().catch(() => undefined))
}

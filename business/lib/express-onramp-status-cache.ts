import { fetchWithSession } from "@/lib/fetch-with-session"
import { CACHE_KEYS, dataCache } from "@/lib/cache"
import { prefetchExpressOnramp } from "@/lib/stripe/load-crypto-onramp"
import { expressDepositsStatusIsReady, keepExpressDepositsCachedReady } from "@easner/shared"

export type BusinessExpressOnrampStatus = {
  eligible?: boolean
  ready?: boolean
  payerCountry?: string | null
  methods?: string[]
  publishableKey?: string
  cryptoCustomerId?: string | null
  nextStep?: string
  status?: string
  kycTiers?: unknown[]
  office?: { stripeOnrampEnabled?: boolean; stripeOnrampEuEnabled?: boolean }
  prefill?: Record<string, unknown>
  error?: string
}

const SCOPE = { "X-Easner-Account-Scope": "business" } as const
const LS_PREFIX = "express_onramp_status_v1_"
const LS_LAST = "express_onramp_status_v1_last"
const LS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const MEMORY_TTL_MS = 5 * 60 * 1000

let cached: BusinessExpressOnrampStatus | null = null
let cachedUserId: string | null = null
let inflight: Promise<BusinessExpressOnrampStatus> | null = null

function persistKey(userId: string) {
  return `${LS_PREFIX}${userId}`
}

function readPersisted(userId?: string | null): BusinessExpressOnrampStatus | null {
  if (typeof window === "undefined") return null
  try {
    const raw = userId
      ? localStorage.getItem(persistKey(userId))
      : localStorage.getItem(LS_LAST)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      data?: BusinessExpressOnrampStatus
      timestamp?: number
      userId?: string | null
    }
    const ts = typeof parsed.timestamp === "number" ? parsed.timestamp : 0
    if (!parsed.data || Date.now() - ts > LS_MAX_AGE_MS) return null
    if (userId && parsed.userId && parsed.userId !== userId) return null
    return parsed.data
  } catch {
    return null
  }
}

function writePersisted(data: BusinessExpressOnrampStatus, userId?: string | null) {
  if (typeof window === "undefined") return
  const payload = JSON.stringify({ data, timestamp: Date.now(), userId: userId ?? null })
  try {
    localStorage.setItem(LS_LAST, payload)
    if (userId) {
      localStorage.setItem(persistKey(userId), payload)
      dataCache.set(CACHE_KEYS.EXPRESS_ONRAMP_STATUS(userId), data, MEMORY_TTL_MS)
    }
  } catch {
    // ignore quota / private mode
  }
}

export function cacheBusinessExpressOnrampStatus(
  data: BusinessExpressOnrampStatus,
  userId?: string | null,
) {
  const next = keepExpressDepositsCachedReady({
    cachedReady: expressDepositsStatusIsReady(cached),
    incoming: {
      ready: data.ready,
      status: data.status,
      eligible: data.eligible,
      kycTiers: data.kycTiers,
      cryptoCustomerId: data.cryptoCustomerId,
    },
  })
    ? { ...data, ready: true, status: data.status === "ready" ? data.status : "ready" }
    : data
  cached = next
  cachedUserId = userId ?? cachedUserId
  writePersisted(next, userId ?? cachedUserId)
}

export function peekBusinessExpressOnrampStatus(userId?: string | null): BusinessExpressOnrampStatus | null {
  if (cached && (!userId || !cachedUserId || cachedUserId === userId)) return cached
  const persisted = readPersisted(userId)
  if (persisted) {
    cached = persisted
    cachedUserId = userId ?? cachedUserId
    return persisted
  }
  return cached
}

function loadStatus(userId?: string | null): Promise<BusinessExpressOnrampStatus> {
  if (inflight) return inflight
  inflight = fetchWithSession("/api/stripe/onramp/status", { headers: SCOPE })
    .then(async (res) => {
      const data = (await res.json().catch(() => ({}))) as BusinessExpressOnrampStatus
      if (res.ok) {
        cacheBusinessExpressOnrampStatus(data, userId)
        /** Chunk only — full SDK init hits Stripe controller.html 403 / postMessage noise. */
        prefetchExpressOnramp()
      }
      return data
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function fetchBusinessExpressOnrampStatus(
  force = false,
  userId?: string | null,
): Promise<BusinessExpressOnrampStatus> {
  const hit = peekBusinessExpressOnrampStatus(userId)
  if (!force && hit) {
    void loadStatus(userId).catch(() => undefined)
    return Promise.resolve(hit)
  }
  return loadStatus(userId)
}

export function warmBusinessExpressOnrampStatus(userId?: string | null) {
  void loadStatus(userId).catch(() => undefined)
}

/** Client-side cache so Settings → Online payments can render without a loading spinner. */

import { fetchWithSession } from "@/lib/fetch-with-session"
import { isStripePublishableConfigured } from "@/lib/stripe/public-enabled"

const STORAGE_PREFIX = "easner:stripe-connect-status:"

export type CachedConnectStatus = {
  enabled: boolean
  connectEnabled: boolean
  ready: boolean
  reason?: string | null
  stripeAccountId?: string | null
  onboardingStatus?: string | null
  transfersEnabled?: boolean
  payoutsEnabled?: boolean
  detailsSubmitted?: boolean
  externalAccountLinked?: boolean
  hasGridVa?: boolean
  requirementsCurrentlyDue?: string[]
  payoutDestination?: {
    stripeExternalAccountId: string
    settlementRail?: string | null
    schedule?: Record<string, unknown> | null
  } | null
  cachedAt: number
}

export type ConnectStatusPayload = Omit<CachedConnectStatus, "cachedAt">

const memoryByBusinessId = new Map<string, CachedConnectStatus>()
let latestMemory: CachedConnectStatus | null = null
let inFlight: Promise<ConnectStatusPayload | null> | null = null

function storageKey(businessId: string): string {
  return `${STORAGE_PREFIX}${businessId}`
}

function remember(status: CachedConnectStatus, businessId?: string | null): void {
  latestMemory = status
  if (businessId) memoryByBusinessId.set(businessId, status)
}

/** First-paint status while Stripe Connect is enabled and no cache exists yet. */
export function optimisticConnectStatus(): ConnectStatusPayload {
  return {
    enabled: true,
    connectEnabled: true,
    ready: false,
    stripeAccountId: null,
    transfersEnabled: false,
    payoutsEnabled: false,
    detailsSubmitted: false,
    externalAccountLinked: false,
    hasGridVa: false,
    requirementsCurrentlyDue: [],
  }
}

export function readCachedConnectStatus(
  businessId: string | null | undefined,
): CachedConnectStatus | null {
  if (typeof window === "undefined") return latestMemory
  if (businessId) {
    const mem = memoryByBusinessId.get(businessId)
    if (mem) return mem
    try {
      const raw = sessionStorage.getItem(storageKey(businessId))
      if (raw) {
        const parsed = JSON.parse(raw) as CachedConnectStatus
        if (parsed && typeof parsed === "object" && typeof parsed.cachedAt === "number") {
          remember(parsed, businessId)
          return parsed
        }
      }
    } catch {
      // ignore quota / private mode
    }
  }
  return latestMemory
}

export function writeCachedConnectStatus(
  businessId: string | null | undefined,
  status: ConnectStatusPayload,
): void {
  const payload: CachedConnectStatus = { ...status, cachedAt: Date.now() }
  remember(payload, businessId)
  if (!businessId || typeof window === "undefined") return
  try {
    sessionStorage.setItem(storageKey(businessId), JSON.stringify(payload))
  } catch {
    // ignore quota / private mode
  }
}

export function clearCachedConnectStatus(businessId: string | null | undefined): void {
  if (businessId) {
    const existing = memoryByBusinessId.get(businessId)
    memoryByBusinessId.delete(businessId)
    if (existing && existing === latestMemory) latestMemory = null
  } else {
    latestMemory = null
  }
  if (!businessId || typeof window === "undefined") return
  try {
    sessionStorage.removeItem(storageKey(businessId))
  } catch {
    // ignore
  }
}

export function initialConnectStatus(): ConnectStatusPayload | null {
  if (isStripePublishableConfigured()) return optimisticConnectStatus()
  return null
}

export async function fetchAndCacheConnectStatus(
  businessId?: string | null,
): Promise<ConnectStatusPayload | null> {
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const res = await fetchWithSession("/api/business/stripe/connect/status")
      const json = (await res.json()) as ConnectStatusPayload
      if (!res.ok) return null
      writeCachedConnectStatus(businessId, json)
      return json
    } catch {
      return null
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

/** Warm Connect status before the Verification tab mounts. Dedupes in-flight fetches. */
export function primeConnectStatus(businessId?: string | null): void {
  if (typeof window === "undefined") return
  if (!isStripePublishableConfigured()) return
  void fetchAndCacheConnectStatus(businessId)
}

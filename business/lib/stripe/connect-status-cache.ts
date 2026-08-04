/** Client-side cache so Settings → Online payments renders instantly on revisit. */

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

function storageKey(businessId: string): string {
  return `${STORAGE_PREFIX}${businessId}`
}

export function readCachedConnectStatus(businessId: string | null | undefined): CachedConnectStatus | null {
  if (!businessId || typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(storageKey(businessId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedConnectStatus
    if (!parsed || typeof parsed !== "object" || typeof parsed.cachedAt !== "number") return null
    return parsed
  } catch {
    return null
  }
}

export function writeCachedConnectStatus(
  businessId: string | null | undefined,
  status: Omit<CachedConnectStatus, "cachedAt">,
): void {
  if (!businessId || typeof window === "undefined") return
  try {
    const payload: CachedConnectStatus = { ...status, cachedAt: Date.now() }
    sessionStorage.setItem(storageKey(businessId), JSON.stringify(payload))
  } catch {
    // ignore quota / private mode
  }
}

export function clearCachedConnectStatus(businessId: string | null | undefined): void {
  if (!businessId || typeof window === "undefined") return
  try {
    sessionStorage.removeItem(storageKey(businessId))
  } catch {
    // ignore
  }
}

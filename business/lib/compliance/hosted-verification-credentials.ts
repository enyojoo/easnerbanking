import { fetchWithSession } from "@/lib/fetch-with-session"
import { applyHostedKycStatusToProfile } from "@/lib/use-business-profile"

export type HostedCredentials = {
  link: string | null
  token: string | null
  expiresAt?: string | null
}

export type HostedCredentialsFetchResult = HostedCredentials & {
  json: {
    kyc_link?: string | null
    kyc_token?: string | null
    error?: string
    alreadyOnboarded?: boolean
    kyc_status?: string
    code?: string
    canResubmit?: boolean
    expiresAt?: string | null
  }
  res: Response
}

const credentialsCache = new Map<string, HostedCredentials>()
const resumeAvailableCache = new Map<string, boolean>()
const inFlightByBusinessId = new Map<string, Promise<HostedCredentialsFetchResult>>()

const SESSION_PREFIX = "easner_hosted_kyb_v1:"
const FALLBACK_TTL_MS = 50 * 60 * 1000
const EXPIRY_SKEW_MS = 60_000

type PersistedHostedCredentials = HostedCredentials & { storedAt: number }

function sessionKey(businessId: string): string {
  return `${SESSION_PREFIX}${businessId}`
}

function credentialsStillValid(credentials: HostedCredentials, now = Date.now()): boolean {
  if (!hostedCredentialsAreReady(credentials)) return false
  const expiresAtMs = credentials.expiresAt ? Date.parse(credentials.expiresAt) : Number.NaN
  if (Number.isFinite(expiresAtMs)) {
    return expiresAtMs - EXPIRY_SKEW_MS > now
  }
  return true
}

function isPersistedFresh(entry: PersistedHostedCredentials, now = Date.now()): boolean {
  if (!credentialsStillValid(entry, now)) return false
  if (entry.expiresAt) return true
  return now - entry.storedAt < FALLBACK_TTL_MS
}

function readPersistedCredentials(businessId: string): HostedCredentials | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(sessionKey(businessId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedHostedCredentials
    if (!parsed || typeof parsed !== "object") return null
    if (!isPersistedFresh(parsed)) {
      sessionStorage.removeItem(sessionKey(businessId))
      return null
    }
    return { link: parsed.link ?? null, token: parsed.token ?? null, expiresAt: parsed.expiresAt ?? null }
  } catch {
    return null
  }
}

function writePersistedCredentials(businessId: string, credentials: HostedCredentials) {
  if (typeof window === "undefined") return
  try {
    if (!hostedCredentialsAreReady(credentials)) {
      sessionStorage.removeItem(sessionKey(businessId))
      return
    }
    const payload: PersistedHostedCredentials = {
      link: credentials.link,
      token: credentials.token,
      expiresAt: credentials.expiresAt ?? null,
      storedAt: Date.now(),
    }
    sessionStorage.setItem(sessionKey(businessId), JSON.stringify(payload))
  } catch {
    // ignore quota / private mode
  }
}

export function readHostedCredentialsCache(businessId: string | null | undefined): HostedCredentials {
  if (!businessId) return { link: null, token: null }
  const memory = credentialsCache.get(businessId)
  if (memory && credentialsStillValid(memory)) return memory
  const persisted = readPersistedCredentials(businessId)
  if (persisted) {
    storeHostedCredentials(businessId, persisted)
    return persisted
  }
  return { link: null, token: null }
}

export function hostedCredentialsAreReady(credentials: HostedCredentials): boolean {
  return Boolean(credentials.link?.trim() || credentials.token?.trim())
}

export function readHostedResumeAvailable(businessId: string | null | undefined): boolean | null {
  if (!businessId) return null
  if (resumeAvailableCache.has(businessId)) return resumeAvailableCache.get(businessId) ?? null
  const persisted = readPersistedCredentials(businessId)
  if (persisted) {
    storeHostedCredentials(businessId, persisted)
    return true
  }
  return null
}

function storeHostedCredentials(businessId: string, credentials: HostedCredentials) {
  if (!credentialsStillValid(credentials)) {
    credentialsCache.delete(businessId)
    resumeAvailableCache.set(businessId, false)
    writePersistedCredentials(businessId, { link: null, token: null })
    return
  }
  credentialsCache.set(businessId, credentials)
  resumeAvailableCache.set(businessId, true)
  writePersistedCredentials(businessId, credentials)
}

export function writeHostedCredentialsCache(businessId: string, credentials: HostedCredentials) {
  storeHostedCredentials(businessId, credentials)
}

export async function fetchHostedVerificationCredentials(options?: {
  refresh?: boolean
}): Promise<HostedCredentialsFetchResult> {
  const res = await fetchWithSession("/api/grid/kyc-links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "business", refresh: options?.refresh === true }),
  })
  const text = await res.text()
  let json = {} as HostedCredentialsFetchResult["json"]
  if (text) {
    try {
      json = JSON.parse(text) as HostedCredentialsFetchResult["json"]
    } catch {
      json = {}
    }
  }
  const linkRaw = typeof json.kyc_link === "string" ? json.kyc_link.trim() : ""
  const tokenRaw = typeof json.kyc_token === "string" ? json.kyc_token.trim() : ""
  const expiresAt = typeof json.expiresAt === "string" ? json.expiresAt : null
  if (res.ok) {
    applyHostedKycStatusToProfile(json.kyc_status)
  }
  return {
    link: linkRaw || null,
    token: tokenRaw || null,
    expiresAt,
    json,
    res,
  }
}

export type PrimeHostedVerificationOptions = {
  businessId: string
  /** Skip network when cache already has a link or token. Default true. */
  useCache?: boolean
}

/**
 * Warm Grid KYB credentials before the user clicks Begin verification.
 * Dedupes concurrent requests per business.
 */
export async function primeHostedVerificationCredentials(
  options: PrimeHostedVerificationOptions,
): Promise<HostedCredentialsFetchResult> {
  const { businessId, useCache = true } = options
  if (useCache) {
    const cached = readHostedCredentialsCache(businessId)
    if (hostedCredentialsAreReady(cached)) {
      return {
        link: cached.link,
        token: cached.token,
        expiresAt: cached.expiresAt ?? null,
        json: {},
        res: new Response(null, { status: 200 }),
      }
    }
  }

  let inFlight = inFlightByBusinessId.get(businessId)
  if (!inFlight) {
    inFlight = fetchHostedVerificationCredentials().then((result) => {
      if (result.res.ok) {
        storeHostedCredentials(businessId, {
          link: result.link,
          token: result.token,
          expiresAt: result.expiresAt ?? null,
        })
      }
      return result
    })
    inFlightByBusinessId.set(businessId, inFlight)
    void inFlight.finally(() => {
      if (inFlightByBusinessId.get(businessId) === inFlight) {
        inFlightByBusinessId.delete(businessId)
      }
    })
  }

  return inFlight
}

export function preloadSumsubWebSdk(): void {
  void import("@sumsub/websdk")
}

/** Test helper – clears in-memory caches only (sessionStorage kept). */
export function __clearHostedCredentialsMemoryForTests(): void {
  credentialsCache.clear()
  resumeAvailableCache.clear()
  inFlightByBusinessId.clear()
}

/** Test helper – clears in-memory + session caches. */
export function __resetHostedCredentialsCacheForTests(): void {
  __clearHostedCredentialsMemoryForTests()
  if (typeof window === "undefined") return
  try {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(SESSION_PREFIX)) keys.push(key)
    }
    for (const key of keys) sessionStorage.removeItem(key)
  } catch {
    // ignore
  }
}

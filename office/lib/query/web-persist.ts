"use client"

import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client"

/**
 * Office query-cache persistence — the business app's pattern, applied here
 * so the admin surface meets the same Instant Standard: reload paints every
 * page from the on-device cache immediately and freshens silently.
 *
 * Same posture as business (which persists the same class of financial
 * records): per-user key, `webPersist: "reduced"` allowlist via query meta,
 * 12h max age, cleared on sign-out. Writes are coalesced (~3s) and deferred
 * to idle so persistence never competes with interactions.
 */

export const OFFICE_WEB_QUERY_CACHE_BUSTER = "office-web-query-cache-v2"
export const OFFICE_WEB_QUERY_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000

const OFFICE_WEB_QUERY_CACHE_KEY_PREFIX_V1 = "easner_office_query_cache_v1_"
const OFFICE_WEB_QUERY_CACHE_KEY_PREFIX = "easner_office_query_cache_v2_"

/** Guards the legacy full-localStorage sweep so it runs at most once per session. */
let sweepDoneThisSession = false

function removeLocalStorageKeys(keys: string[]) {
  if (typeof window === "undefined") return
  for (const key of keys) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // ignore quota / privacy mode errors
    }
  }
}

export function officeWebQueryCacheKey(userId: string): string {
  return `${OFFICE_WEB_QUERY_CACHE_KEY_PREFIX}${userId}`
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * Synchronous last-known-user probe from Supabase auth storage — the
 * persister must know its key on the FIRST render (PersistQueryClientProvider
 * restores exactly once; business learned this the hard way).
 */
export function probeStoredOfficeUserId(): string | null {
  if (typeof window === "undefined") return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return null
  let ref: string | null = null
  try {
    ref = new URL(url).hostname.split(".")[0] ?? null
  } catch {
    return null
  }
  if (!ref) return null
  const parsed = safeParse<Record<string, unknown>>(window.localStorage.getItem(`sb-${ref}-auth-token`))
  if (!parsed) return null
  const user =
    (parsed.user as Record<string, unknown> | undefined) ??
    ((parsed.currentSession as Record<string, unknown> | undefined)?.user as
      | Record<string, unknown>
      | undefined)
  const id = user?.id
  return typeof id === "string" && id.trim() ? id : null
}

export function clearPersistedOfficeQueryCache(userId?: string | null): void {
  if (typeof window === "undefined") return
  if (userId) {
    removeLocalStorageKeys([officeWebQueryCacheKey(userId), `${OFFICE_WEB_QUERY_CACHE_KEY_PREFIX_V1}${userId}`])
    return
  }
  if (sweepDoneThisSession) return
  sweepDoneThisSession = true
  const keys: string[] = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (
      key &&
      (key.startsWith(OFFICE_WEB_QUERY_CACHE_KEY_PREFIX) ||
        key.startsWith(OFFICE_WEB_QUERY_CACHE_KEY_PREFIX_V1))
    ) {
      keys.push(key)
    }
  }
  removeLocalStorageKeys(keys)
}

export function clearAllOfficeBrowserState(userId?: string | null): void {
  clearPersistedOfficeQueryCache(userId)
}

export function createOfficeQueryPersister(userId: string | null): Persister {
  const PERSIST_THROTTLE_MS = 3_000
  let pendingClient: PersistedClient | null = null
  let flushTimer: number | null = null

  const writeNow = () => {
    if (typeof window === "undefined" || !userId) return
    const toWrite = pendingClient
    pendingClient = null
    if (!toWrite) return
    try {
      window.localStorage.setItem(officeWebQueryCacheKey(userId), JSON.stringify(toWrite))
    } catch {
      clearPersistedOfficeQueryCache(userId)
    }
  }

  if (typeof window !== "undefined" && userId) {
    window.addEventListener("pagehide", writeNow)
  }

  return {
    persistClient: async (client: PersistedClient) => {
      if (typeof window === "undefined" || !userId) return
      pendingClient = client
      if (flushTimer != null) return
      flushTimer = window.setTimeout(() => {
        flushTimer = null
        const w = window as Window & {
          requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
        }
        if (typeof w.requestIdleCallback === "function") {
          w.requestIdleCallback(() => writeNow(), { timeout: 2_000 })
        } else {
          writeNow()
        }
      }, PERSIST_THROTTLE_MS)
    },
    restoreClient: async () => {
      if (typeof window === "undefined" || !userId) return undefined
      return (
        safeParse<PersistedClient>(window.localStorage.getItem(officeWebQueryCacheKey(userId))) ??
        undefined
      )
    },
    removeClient: async () => {
      clearPersistedOfficeQueryCache(userId)
    },
  }
}

export function shouldPersistOfficeQuery(query: {
  state?: { status?: string }
  meta?: { webPersist?: "none" | "reduced" }
}): boolean {
  return query.state?.status === "success" && query.meta?.webPersist === "reduced"
}

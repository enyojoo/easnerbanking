"use client"

import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client"

export const BUSINESS_WEB_QUERY_CACHE_BUSTER = "business-web-query-cache-v1"
export const BUSINESS_WEB_QUERY_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000

const BUSINESS_WEB_QUERY_CACHE_KEY_PREFIX = "easner_business_query_cache_v1_"
const BUSINESS_STARTUP_SNAPSHOT_KEY = "easner_business_startup_snapshot_v1"
const STARTUP_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

type JsonRecord = Record<string, unknown>

export type BusinessStartupSnapshot = {
  userId: string
  businessId: string | null
  updatedAt: number
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function getSupabaseProjectRef(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return null
  try {
    return new URL(url).hostname.split(".")[0] ?? null
  } catch {
    return null
  }
}

function getSupabaseAuthStorageKey(): string | null {
  const ref = getSupabaseProjectRef()
  return ref ? `sb-${ref}-auth-token` : null
}

function findUserId(value: unknown, depth = 0): string | null {
  if (depth > 5 || value == null) return null
  if (typeof value === "string") {
    return /^[0-9a-f-]{16,}$/i.test(value) ? value : null
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findUserId(item, depth + 1)
      if (nested) return nested
    }
    return null
  }
  if (typeof value !== "object") return null

  const record = value as JsonRecord
  if (typeof record.user === "object" && record.user && typeof (record.user as JsonRecord).id === "string") {
    return String((record.user as JsonRecord).id)
  }
  if (typeof record.id === "string" && /^[0-9a-f-]{16,}$/i.test(record.id)) {
    return record.id
  }
  if (typeof record.sub === "string" && /^[0-9a-f-]{16,}$/i.test(record.sub)) {
    return record.sub
  }

  for (const key of ["currentSession", "session", "data"]) {
    const nested = findUserId(record[key], depth + 1)
    if (nested) return nested
  }

  return null
}

function findNumberField(value: unknown, field: string, depth = 0): number | null {
  if (depth > 5 || value == null) return null
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as JsonRecord
    const direct = record[field]
    if (typeof direct === "number" && Number.isFinite(direct)) return direct
    if (typeof direct === "string" && direct.trim()) {
      const parsed = Number(direct)
      if (Number.isFinite(parsed)) return parsed
    }
    for (const key of ["currentSession", "session", "data"]) {
      const nested = findNumberField(record[key], field, depth + 1)
      if (nested != null) return nested
    }
  }
  return null
}

function findStringField(value: unknown, field: string, depth = 0): string | null {
  if (depth > 5 || value == null) return null
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as JsonRecord
    const direct = record[field]
    if (typeof direct === "string" && direct.trim()) return direct
    for (const key of ["currentSession", "session", "data"]) {
      const nested = findStringField(record[key], field, depth + 1)
      if (nested) return nested
    }
  }
  return null
}

export type StoredSupabaseSessionProbe = {
  userId: string | null
  /** True when local storage has a session that can still authenticate (valid access or refresh token). */
  likelyAuthenticated: boolean
}

/** SSR-safe probe. Reading localStorage during render causes React #418 hydration mismatches. */
export const EMPTY_STORED_SUPABASE_SESSION_PROBE: StoredSupabaseSessionProbe = {
  userId: null,
  likelyAuthenticated: false,
}

/** Synchronous read of Supabase auth storage – used for instant login redirect vs optimistic cache boot. */
export function probeStoredSupabaseSession(): StoredSupabaseSessionProbe {
  if (typeof window === "undefined") {
    return { userId: null, likelyAuthenticated: false }
  }
  const storageKey = getSupabaseAuthStorageKey()
  if (!storageKey) return { userId: null, likelyAuthenticated: false }
  const parsed = safeParse<unknown>(window.localStorage.getItem(storageKey))
  const userId = findUserId(parsed)
  if (!userId) return { userId: null, likelyAuthenticated: false }

  const accessToken = findStringField(parsed, "access_token")
  const refreshToken = findStringField(parsed, "refresh_token")
  if (!accessToken && !refreshToken) {
    return { userId, likelyAuthenticated: false }
  }

  const expiresAt = findNumberField(parsed, "expires_at")
  const nowSec = Math.floor(Date.now() / 1000)
  const accessValid = expiresAt == null || expiresAt > nowSec - 15

  return {
    userId,
    likelyAuthenticated: accessValid || Boolean(refreshToken),
  }
}

function localStorageKeys(): string[] {
  if (typeof window === "undefined") return []
  const keys: string[] = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key) keys.push(key)
  }
  return keys
}

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

export function businessWebQueryCacheKey(userId: string): string {
  return `${BUSINESS_WEB_QUERY_CACHE_KEY_PREFIX}${userId}`
}

export function readStoredSupabaseSessionUserId(): string | null {
  return probeStoredSupabaseSession().userId
}

export function readBusinessStartupSnapshot(): BusinessStartupSnapshot | null {
  if (typeof window === "undefined") return null
  const parsed = safeParse<BusinessStartupSnapshot>(window.localStorage.getItem(BUSINESS_STARTUP_SNAPSHOT_KEY))
  if (!parsed?.userId || typeof parsed.updatedAt !== "number") return null
  if (Date.now() - parsed.updatedAt > STARTUP_SNAPSHOT_MAX_AGE_MS) return null
  return {
    userId: parsed.userId,
    businessId: typeof parsed.businessId === "string" && parsed.businessId.trim() ? parsed.businessId : null,
    updatedAt: parsed.updatedAt,
  }
}

export function writeBusinessStartupSnapshot(snapshot: Omit<BusinessStartupSnapshot, "updatedAt">): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      BUSINESS_STARTUP_SNAPSHOT_KEY,
      JSON.stringify({
        ...snapshot,
        updatedAt: Date.now(),
      } satisfies BusinessStartupSnapshot),
    )
  } catch {
    // ignore storage failures
  }
}

export function clearBusinessStartupSnapshot(): void {
  removeLocalStorageKeys([BUSINESS_STARTUP_SNAPSHOT_KEY])
}

export function clearPersistedBusinessQueryCache(userId?: string | null): void {
  if (typeof window === "undefined") return
  if (userId) {
    removeLocalStorageKeys([businessWebQueryCacheKey(userId)])
    return
  }
  removeLocalStorageKeys(
    localStorageKeys().filter((key) => key.startsWith(BUSINESS_WEB_QUERY_CACHE_KEY_PREFIX)),
  )
}

export function clearLegacyBusinessLocalSnapshots(userId?: string | null): void {
  if (typeof window === "undefined") return

  const exactKeys = userId
    ? [
        `autopayout_list_cache_${userId}`,
        `autopayout_payer_wallets_${userId}`,
        `business_onboarding_steps_${userId}`,
        `business_profile_cache_${userId}`,
        `communication_preferences_${userId}`,
        `personal_settings_${userId}`,
        `personal_settings_cache_${userId}`,
        `recipients_cache_v2_${userId}`,
        `settings_team_${userId}`,
        `terminal_payout_setup_${userId}`,
        `terminal_sessions_cache_${userId}`,
        `business_noah_accounts_${userId}`,
        `easner_business_bootstrap_v1_${userId}`,
      ]
    : []

  const prefixKeys = localStorageKeys().filter((key) => {
    if (!userId) {
      return (
        key === "easner_business_transactions_list_v1" ||
        [
        "autopayout_list_cache_",
        "autopayout_payer_wallets_",
        "business_onboarding_steps_",
        "business_profile_cache_",
        "communication_preferences_",
        "personal_settings_",
        "personal_settings_cache_",
        "recipients_cache_v2_",
        "settings_team_",
        "terminal_payout_setup_",
        "terminal_sessions_cache_",
        "business_noah_accounts_",
        "easner_business_bootstrap_v1_",
        "easner_business_wallets_list_v1_",
      ].some((prefix) => key.startsWith(prefix))
      )
    }
    if (key.startsWith("easner_business_wallets_list_v1_")) return true
    if (key.startsWith("business_onboarding_steps_")) return true
    if (key === "easner_business_transactions_list_v1") return true
    return false
  })

  removeLocalStorageKeys([...exactKeys, ...prefixKeys])
}

export function clearAllBusinessBrowserState(userId?: string | null): void {
  clearPersistedBusinessQueryCache(userId)
  clearLegacyBusinessLocalSnapshots(userId)
  clearBusinessStartupSnapshot()
}

export function createBusinessQueryPersister(userId: string | null): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      if (typeof window === "undefined" || !userId) return
      try {
        window.localStorage.setItem(businessWebQueryCacheKey(userId), JSON.stringify(client))
      } catch {
        // If persistence fails, drop the older cache and move on.
        clearPersistedBusinessQueryCache(userId)
      }
    },
    restoreClient: async () => {
      if (typeof window === "undefined" || !userId) return undefined
      return safeParse<PersistedClient>(window.localStorage.getItem(businessWebQueryCacheKey(userId))) ?? undefined
    },
    removeClient: async () => {
      clearPersistedBusinessQueryCache(userId)
    },
  }
}

export function shouldPersistBusinessQuery(query: {
  state?: { status?: string }
  meta?: { webPersist?: "none" | "reduced" }
}): boolean {
  return query.state?.status === "success" && query.meta?.webPersist === "reduced"
}

"use client"

import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client"

export const OFFICE_WEB_QUERY_CACHE_BUSTER = "office-web-query-cache-v2"
export const OFFICE_WEB_QUERY_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000

const OFFICE_WEB_QUERY_CACHE_KEY_PREFIX = "easner_office_query_cache_v1_"

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

  const record = value as Record<string, unknown>
  if (typeof record.user === "object" && record.user && typeof (record.user as Record<string, unknown>).id === "string") {
    return String((record.user as Record<string, unknown>).id)
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

export function officeWebQueryCacheKey(userId: string): string {
  return `${OFFICE_WEB_QUERY_CACHE_KEY_PREFIX}${userId}`
}

export function readStoredSupabaseSessionUserId(): string | null {
  if (typeof window === "undefined") return null
  const storageKey = getSupabaseAuthStorageKey()
  if (!storageKey) return null
  const parsed = safeParse<unknown>(window.localStorage.getItem(storageKey))
  return findUserId(parsed)
}

export function clearPersistedOfficeQueryCache(userId?: string | null): void {
  if (typeof window === "undefined") return
  if (userId) {
    removeLocalStorageKeys([officeWebQueryCacheKey(userId)])
    return
  }
  removeLocalStorageKeys(
    localStorageKeys().filter((key) => key.startsWith(OFFICE_WEB_QUERY_CACHE_KEY_PREFIX)),
  )
}

export function clearAllOfficeBrowserState(userId?: string | null): void {
  clearPersistedOfficeQueryCache(userId)
}

export function createOfficeQueryPersister(userId: string | null): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      if (typeof window === "undefined" || !userId) return
      try {
        window.localStorage.setItem(officeWebQueryCacheKey(userId), JSON.stringify(client))
      } catch {
        clearPersistedOfficeQueryCache(userId)
      }
    },
    restoreClient: async () => {
      if (typeof window === "undefined" || !userId) return undefined
      return safeParse<PersistedClient>(window.localStorage.getItem(officeWebQueryCacheKey(userId))) ?? undefined
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

"use client"

import type { QueryClient } from "@tanstack/react-query"
import { useAuth } from "@/lib/auth-context"
import { CACHE_KEYS, dataCache } from "@/lib/cache"
import { listRecipients } from "@/lib/recipients-store"
import type { Beneficiary } from "@/lib/recipient-types"
import { useCachedData } from "@/lib/use-cached-data"

export const RECIPIENTS_CACHE_TTL_MS = 60 * 60 * 1000

export function recipientsCompatQueryKey(userId: string) {
  return ["business", "compat-cache", CACHE_KEYS.RECIPIENTS(userId)] as const
}

export function recipientsCachePersistKey(userId: string) {
  return `recipients_cache_v2_${userId}`
}

export function invalidateRecipientsCache(queryClient: QueryClient, userId: string) {
  void queryClient.invalidateQueries({ queryKey: recipientsCompatQueryKey(userId) })
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(recipientsCachePersistKey(userId))
    } catch {
      // Ignore storage errors.
    }
  }
  dataCache.invalidate(CACHE_KEYS.RECIPIENTS(userId))
}

export function rememberSavedRecipient(queryClient: QueryClient, userId: string, beneficiary: Beneficiary) {
  const queryKey = recipientsCompatQueryKey(userId)
  queryClient.setQueryData<Beneficiary[]>(queryKey, (prev) => {
    const list = Array.isArray(prev) ? prev : []
    return [beneficiary, ...list.filter((row) => row.id !== beneficiary.id)]
  })
  if (typeof window === "undefined") return
  try {
    const persistKey = recipientsCachePersistKey(userId)
    const current = queryClient.getQueryData<Beneficiary[]>(queryKey) ?? [beneficiary]
    window.localStorage.setItem(persistKey, JSON.stringify({ data: current, timestamp: Date.now() }))
  } catch {
    // Ignore storage quota/write errors.
  }
}

async function fetchRecipientsSafe(userId: string): Promise<Beneficiary[]> {
  try {
    return await listRecipients(userId)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (message.toLowerCase().includes("bad request")) {
      return []
    }
    throw e
  }
}

/**
 * Shared recipient list cache (memory + localStorage) for Settings recipients, /send picker, etc.
 * When {@param enabled} is false, no fetch runs (e.g. parent supplies an explicit list).
 */
export function useRecipientsCached(enabled: boolean) {
  const { user, sessionUserId } = useAuth()
  const profileUserId = sessionUserId ?? user?.id

  return useCachedData<Beneficiary[]>({
    enabled: enabled && Boolean(profileUserId),
    cacheKey: profileUserId ? CACHE_KEYS.RECIPIENTS(profileUserId) : null,
    persistKey: profileUserId ? recipientsCachePersistKey(profileUserId) : undefined,
    initialData: [],
    ttlMs: RECIPIENTS_CACHE_TTL_MS,
    fetcher: async () => fetchRecipientsSafe(profileUserId!),
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      console.error("Failed to load recipients:", message)
    },
  })
}

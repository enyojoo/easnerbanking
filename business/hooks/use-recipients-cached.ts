"use client"

import type { QueryClient } from "@tanstack/react-query"
import { useAuth } from "@/lib/auth-context"
import { CACHE_KEYS } from "@/lib/cache"
import { listRecipients } from "@/lib/recipients-store"
import type { Beneficiary } from "@/lib/recipient-types"
import { useCachedData } from "@/lib/use-cached-data"

export const RECIPIENTS_CACHE_TTL_MS = 60 * 60 * 1000

export function recipientsCompatQueryKey(userId: string) {
  return ["business", "compat-cache", CACHE_KEYS.RECIPIENTS(userId)] as const
}

export function invalidateRecipientsCache(queryClient: QueryClient, userId: string) {
  return queryClient.invalidateQueries({ queryKey: recipientsCompatQueryKey(userId) })
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
    persistKey: profileUserId ? `recipients_cache_v2_${profileUserId}` : undefined,
    initialData: [],
    ttlMs: RECIPIENTS_CACHE_TTL_MS,
    fetcher: async () => fetchRecipientsSafe(profileUserId!),
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      console.error("Failed to load recipients:", message)
    },
  })
}

"use client"

import { useAuth } from "@/lib/auth-context"
import { CACHE_KEYS } from "@/lib/cache"
import { listRecipients } from "@/lib/recipients-store"
import type { Beneficiary } from "@/lib/recipient-types"
import { useCachedData } from "@/lib/use-cached-data"

export const RECIPIENTS_CACHE_TTL_MS = 60 * 60 * 1000

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
 * Shared recipient list cache (memory + localStorage) for /recipients, /send picker, etc.
 * When {@param enabled} is false, no fetch runs (e.g. parent supplies an explicit list).
 */
export function useRecipientsCached(enabled: boolean) {
  const { user, isLoading } = useAuth()

  return useCachedData<Beneficiary[]>({
    enabled: enabled && !isLoading && Boolean(user?.id),
    cacheKey: user?.id ? CACHE_KEYS.RECIPIENTS(user.id) : null,
    persistKey: user?.id ? `recipients_cache_${user.id}` : undefined,
    initialData: [],
    ttlMs: RECIPIENTS_CACHE_TTL_MS,
    fetcher: async () => fetchRecipientsSafe(user!.id),
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      console.error("Failed to load recipients:", message)
    },
  })
}

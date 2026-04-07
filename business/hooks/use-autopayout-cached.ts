"use client"

import { useCallback } from "react"
import { useAuth } from "@/lib/auth-context"
import { CACHE_KEYS } from "@/lib/cache"
import { useCachedData } from "@/lib/use-cached-data"
import { fetchWithSession } from "@/lib/fetch-with-session"

export type AutopayoutListRow = {
  id: string
  created_at: string
  recipient_id: string
  label: string | null
  crypto_currency: string
  network: string
  deposit_address: string | null
  status: string
  expires_at: string | null
  placard_generated_at: string | null
  recipient_summary: { full_name: string; bank_name: string; currency: string } | null
}

export const AUTOPAYOUT_LIST_CACHE_TTL_MS = 5 * 60 * 1000

async function fetchAutopayoutList(): Promise<AutopayoutListRow[]> {
  const res = await fetchWithSession("/api/autopayout")
  const body = (await res.json().catch(() => ({}))) as { autopayouts?: AutopayoutListRow[]; error?: string }
  if (!res.ok) {
    throw new Error(body.error || "Failed to load QR Pay list")
  }
  return body.autopayouts ?? []
}

export function useAutopayoutCached() {
  const { user, isLoading } = useAuth()

  const fetcher = useCallback(() => fetchAutopayoutList(), [])

  return useCachedData<AutopayoutListRow[]>({
    enabled: Boolean(user?.id) && !isLoading,
    cacheKey: user?.id ? CACHE_KEYS.AUTOPAYOUT_LIST(user.id) : null,
    persistKey: user?.id ? `autopayout_list_cache_${user.id}` : undefined,
    initialData: [],
    ttlMs: AUTOPAYOUT_LIST_CACHE_TTL_MS,
    fetcher,
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      console.error("QR Pay list load failed:", message)
    },
  })
}

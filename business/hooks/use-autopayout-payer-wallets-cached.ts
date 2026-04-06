"use client"

import { useCallback } from "react"
import { useAuth } from "@/lib/auth-context"
import { CACHE_KEYS } from "@/lib/cache"
import { useCachedData } from "@/lib/use-cached-data"
import { fetchWithSession } from "@/lib/fetch-with-session"

export type AutopayoutPayerWalletRow = {
  id: string
  source_address: string
  crypto_currency: string
  network: string
  label: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export const AUTOPAYOUT_PAYER_WALLETS_CACHE_TTL_MS = 5 * 60 * 1000

async function fetchPayerWallets(): Promise<AutopayoutPayerWalletRow[]> {
  const res = await fetchWithSession("/api/autopayout/payer-wallets")
  const body = (await res.json().catch(() => ({}))) as { wallets?: AutopayoutPayerWalletRow[]; error?: string }
  if (!res.ok) {
    throw new Error(body.error || "Failed to load payer wallets")
  }
  return (body.wallets ?? []).map((w) => ({
    ...w,
    archived_at: w.archived_at ?? null,
  }))
}

export function useAutopayoutPayerWalletsCached() {
  const { user, isLoading } = useAuth()

  const fetcher = useCallback(() => fetchPayerWallets(), [])

  return useCachedData<AutopayoutPayerWalletRow[]>({
    enabled: Boolean(user?.id) && !isLoading,
    cacheKey: user?.id ? CACHE_KEYS.AUTOPAYOUT_PAYER_WALLETS(user.id) : null,
    persistKey: user?.id ? `autopayout_payer_wallets_${user.id}` : undefined,
    initialData: [],
    ttlMs: AUTOPAYOUT_PAYER_WALLETS_CACHE_TTL_MS,
    fetcher,
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      console.error("Autopayout payer wallets load failed:", message)
    },
  })
}

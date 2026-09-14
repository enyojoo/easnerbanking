"use client"

import { useState } from "react"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { useCachedData } from "@/lib/use-cached-data"

export type AllowedBaseCurrency = { code: string; label: string }

const CACHE_TTL_MS = 15_000

export function useAllowedBaseCurrencies() {
  const [error, setError] = useState<string | null>(null)

  const { data: currencies, loading, refetch } = useCachedData<AllowedBaseCurrency[]>({
    enabled: true,
    cacheKey: "allowed_base_currencies_v2",
    initialData: [],
    ttlMs: CACHE_TTL_MS,
    refetchInterval: CACHE_TTL_MS,
    refetchOnWindowFocus: "always",
    refetchOnMount: "always",
    onError: (e) => setError(e instanceof Error ? e.message : "Failed to load"),
    fetcher: async () => {
      setError(null)
      const res = await fetchWithSession("/api/business/allowed-base-currencies")
      let data: { currencies?: AllowedBaseCurrency[]; error?: string } = {}
      try {
        data = (await res.json()) as typeof data
      } catch {
        throw new Error("Invalid response")
      }
      if (!res.ok) {
        throw new Error(data.error || "Failed to load currencies")
      }
      return data.currencies ?? []
    },
  })

  return { currencies, loading, error, refresh: refetch }
}

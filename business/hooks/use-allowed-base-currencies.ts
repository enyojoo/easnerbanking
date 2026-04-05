"use client"

import { useState } from "react"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { useCachedData } from "@/lib/use-cached-data"

export type AllowedBaseCurrency = { code: string; label: string }

const CACHE_TTL_MS = 60 * 60 * 1000
const PERSIST_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export function useAllowedBaseCurrencies() {
  const [error, setError] = useState<string | null>(null)

  const { data: currencies, loading, refetch } = useCachedData<AllowedBaseCurrency[]>({
    enabled: true,
    cacheKey: "allowed_base_currencies_v1",
    persistKey: "easner_allowed_base_currencies",
    initialData: [],
    ttlMs: CACHE_TTL_MS,
    persistMaxAgeMs: PERSIST_MAX_AGE_MS,
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

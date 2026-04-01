"use client"

import { useCallback, useState } from "react"
import type { CommercialMetrics } from "@/lib/types/commercial"
import { commercialApi } from "@/lib/commercial-api"
import { useCachedData } from "@/lib/use-cached-data"
import { CACHE_KEYS } from "@/lib/cache"

export function useCommercialMetrics() {
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const { data: metrics, setData: setMetrics, loading } = useCachedData<CommercialMetrics | null>({
    enabled: true,
    cacheKey: CACHE_KEYS.COMMERCIAL_METRICS,
    fetcher: async () => commercialApi.getMetrics(),
    initialData: null,
    ttlMs: 5 * 60 * 1000,
    persistKey: "office_commercial_metrics",
    persistMaxAgeMs: 5 * 60 * 1000,
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Failed to load metrics")
    },
  })

  const refresh = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      const data = await commercialApi.getMetrics()
      setMetrics(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load metrics")
    } finally {
      setRefreshing(false)
    }
  }, [setMetrics])

  return { metrics, loading: loading || refreshing, error, refresh }
}

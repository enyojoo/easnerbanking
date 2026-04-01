"use client"

import { useCallback, useState } from "react"
import { useCachedData } from "@/lib/use-cached-data"

interface UseCommercialResourceOptions {
  cacheKey: string
  persistKey: string
  ttlMs?: number
}

export function useCommercialResource<T>(
  loader: () => Promise<T[]>,
  { cacheKey, persistKey, ttlMs = 5 * 60 * 1000 }: UseCommercialResourceOptions,
) {
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const { data: rows, setData: setRows, loading } = useCachedData<T[]>({
    enabled: true,
    cacheKey,
    fetcher: loader,
    initialData: [],
    ttlMs,
    persistKey,
    persistMaxAgeMs: ttlMs,
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Failed to load data")
    },
  })
  const refresh = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      const data = await loader()
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data")
    } finally {
      setRefreshing(false)
    }
  }, [loader, setRows])

  return { rows, setRows, loading: loading || refreshing, error, refresh }
}

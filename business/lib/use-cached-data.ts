"use client"

import { useCallback, useEffect, useState } from "react"
import { dataCache } from "@/lib/cache"

type SetStateAction<T> = T | ((prev: T) => T)

interface UseCachedDataOptions<T> {
  enabled: boolean
  cacheKey: string | null
  fetcher: () => Promise<T>
  initialData: T
  ttlMs?: number
  persistKey?: string
  persistMaxAgeMs?: number
  onError?: (error: unknown) => void
}

/**
 * Shared page-level cache pattern used by settings-style pages:
 * - return cached data immediately when present
 * - fetch only when cache is missing
 * - expose a setter that also updates cache
 */
export function useCachedData<T>({
  enabled,
  cacheKey,
  fetcher,
  initialData,
  ttlMs = 60 * 60 * 1000,
  persistKey,
  persistMaxAgeMs = 30 * 24 * 60 * 60 * 1000,
  onError,
}: UseCachedDataOptions<T>) {
  const [data, setDataState] = useState<T>(initialData)
  const [loading, setLoading] = useState<boolean>(enabled)

  const fetchFresh = useCallback(() => {
    if (!enabled || !cacheKey) return Promise.resolve()
    return fetcher()
      .then((fresh) => {
        setDataState(fresh)
        setLoading(false)
        dataCache.set(cacheKey, fresh, ttlMs)
        if (persistKey && typeof window !== "undefined") {
          try {
            localStorage.setItem(persistKey, JSON.stringify({ data: fresh, timestamp: Date.now() }))
          } catch {
            // Ignore localStorage write errors.
          }
        }
      })
      .catch((error) => {
        setLoading(false)
        onError?.(error)
      })
  }, [enabled, cacheKey, fetcher, ttlMs, persistKey, onError])

  useEffect(() => {
    if (!enabled || !cacheKey) {
      setDataState(initialData)
      setLoading(false)
      return
    }

    const cached = dataCache.get<T>(cacheKey)
    if (cached != null) {
      setDataState(cached)
      setLoading(false)
      // Return cached data instantly, then refresh in background if stale.
      if (dataCache.isStale(cacheKey)) {
        void fetchFresh()
      }
      return
    }

    if (persistKey && typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(persistKey)
        if (raw) {
          const parsed = JSON.parse(raw) as { data?: T; timestamp?: number }
          const ts = typeof parsed?.timestamp === "number" ? parsed.timestamp : 0
          if (parsed?.data != null && Date.now() - ts <= persistMaxAgeMs) {
            setDataState(parsed.data)
            setLoading(false)
            dataCache.set(cacheKey, parsed.data, ttlMs)
            return
          }
        }
      } catch {
        // Ignore localStorage read errors.
      }
    }

    setLoading(true)
    void fetchFresh()

    return () => {
      // no-op
    }
  }, [enabled, cacheKey, initialData, fetchFresh, persistKey, persistMaxAgeMs, ttlMs])

  useEffect(() => {
    if (!enabled || !cacheKey || typeof window === "undefined") return
    const revalidateIfStale = () => {
      if (document.visibilityState === "hidden") return
      if (dataCache.isStale(cacheKey)) void fetchFresh()
    }
    window.addEventListener("focus", revalidateIfStale)
    document.addEventListener("visibilitychange", revalidateIfStale)
    return () => {
      window.removeEventListener("focus", revalidateIfStale)
      document.removeEventListener("visibilitychange", revalidateIfStale)
    }
  }, [enabled, cacheKey, fetchFresh])

  const setData = useCallback(
    (next: SetStateAction<T>) => {
      setDataState((prev) => {
        const resolved = typeof next === "function" ? (next as (value: T) => T)(prev) : next
        if (cacheKey) dataCache.set(cacheKey, resolved, ttlMs)
        if (persistKey && typeof window !== "undefined") {
          try {
            localStorage.setItem(persistKey, JSON.stringify({ data: resolved, timestamp: Date.now() }))
          } catch {
            // Ignore localStorage write errors.
          }
        }
        return resolved
      })
    },
    [cacheKey, ttlMs, persistKey],
  )

  return { data, setData, loading }
}


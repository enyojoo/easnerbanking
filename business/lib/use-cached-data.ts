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
  ttlMs = 2 * 60 * 1000,
  persistKey,
  persistMaxAgeMs = 30 * 24 * 60 * 60 * 1000,
  onError,
}: UseCachedDataOptions<T>) {
  const [data, setDataState] = useState<T>(initialData)
  const [loading, setLoading] = useState<boolean>(enabled)

  useEffect(() => {
    let isMounted = true
    if (!enabled || !cacheKey) {
      setDataState(initialData)
      setLoading(false)
      return
    }

    const cached = dataCache.get<T>(cacheKey)
    if (cached != null) {
      setDataState(cached)
      setLoading(false)
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
    void fetcher()
      .then((fresh) => {
        if (!isMounted) return
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
        if (!isMounted) return
        setLoading(false)
        onError?.(error)
      })

    return () => {
      isMounted = false
    }
  }, [enabled, cacheKey, fetcher, initialData, ttlMs, onError])

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


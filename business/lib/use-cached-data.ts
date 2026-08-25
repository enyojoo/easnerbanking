"use client"

import { useCallback, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

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
  refetchInterval?:
    | number
    | false
    | ((query: { state: { data: T | undefined } }) => number | false)
  refetchOnWindowFocus?: boolean | "always" | ((query: { state: { data: T | undefined } }) => boolean | "always")
  refetchOnMount?: boolean | "always" | ((query: { state: { data: T | undefined } }) => boolean | "always")
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
  refetchInterval = false,
  refetchOnWindowFocus,
  refetchOnMount,
}: UseCachedDataOptions<T>) {
  const queryClient = useQueryClient()
  const queryKey = useMemo(
    () => (cacheKey ? (["business", "compat-cache", cacheKey] as const) : (["business", "compat-cache", "disabled"] as const)),
    [cacheKey],
  )

  const persistedInitial = useMemo(() => {
    if (!persistKey || typeof window === "undefined") return undefined
    try {
      const raw = localStorage.getItem(persistKey)
      if (!raw) return undefined
      const parsed = JSON.parse(raw) as { data?: T; timestamp?: number }
      const ts = typeof parsed?.timestamp === "number" ? parsed.timestamp : 0
      if (parsed?.data != null && Date.now() - ts <= persistMaxAgeMs) {
        // Keep the timestamp: seeding initialData without initialDataUpdatedAt
        // stamps the snapshot as fetched-just-now, so staleTime/sweeps can
        // never see it as stale and it would render as authoritative forever.
        return { data: parsed.data, timestamp: ts }
      }
    } catch {
      // Ignore localStorage read errors.
    }
    return undefined
  }, [persistKey, persistMaxAgeMs])

  const {
    data = persistedInitial?.data ?? initialData,
    isPending,
    isFetching,
    refetch: queryRefetch,
  } = useQuery({
    queryKey,
    enabled: enabled && Boolean(cacheKey),
    queryFn: async () => {
      const fresh = await fetcher()
      if (persistKey && typeof window !== "undefined") {
        try {
          localStorage.setItem(persistKey, JSON.stringify({ data: fresh, timestamp: Date.now() }))
        } catch {
          // Ignore localStorage write errors.
        }
      }
      return fresh
    },
    staleTime: ttlMs,
    gcTime: Math.max(ttlMs * 2, 30_000),
    initialData: persistedInitial?.data,
    initialDataUpdatedAt: persistedInitial?.timestamp,
    refetchInterval,
    refetchOnWindowFocus,
    refetchOnMount,
    meta: { safePersist: true, webPersist: "none", freshness: "operational" },
  })

  const setData = useCallback(
    (next: SetStateAction<T>) => {
      queryClient.setQueryData<T>(queryKey, (prev) => {
        const base = (prev ?? persistedInitial?.data ?? initialData) as T
        const resolved = typeof next === "function" ? (next as (value: T) => T)(base) : next
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
    [queryClient, queryKey, persistedInitial, initialData, persistKey],
  )

  const refetch = useCallback(async () => {
    try {
      await queryRefetch()
    } catch (error) {
      onError?.(error)
    }
  }, [queryRefetch, onError])

  const loading = enabled ? isPending || (isFetching && data == null) : false
  return { data, setData, loading, refetch }
}

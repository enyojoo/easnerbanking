"use client"

import { useEffect, useMemo, useState } from "react"
import { officeDataStore } from "@/lib/office-data-store"
import { useAuth } from "@/lib/auth-context"
import { useCachedData } from "@/lib/use-cached-data"
import { CACHE_KEYS } from "@/lib/cache"

export function useOfficeData() {
  const { user, isAdmin } = useAuth()
  const enabled = Boolean(isAdmin && user)
  const initialData = useMemo(() => {
    const inMemory = officeDataStore.getData()
    if (inMemory) return inMemory
    if (typeof window === "undefined") return null
    try {
      const raw = localStorage.getItem("office_data_cache")
      if (!raw) return null
      const parsed = JSON.parse(raw) as { data?: unknown }
      return (parsed?.data ?? null) as any
    } catch {
      return null
    }
  }, [])
  const [dataInitialized, setDataInitialized] = useState(Boolean(initialData))
  const [error, setError] = useState<string | null>(null)
  const { data, setData, loading } = useCachedData<any>({
    enabled,
    cacheKey: CACHE_KEYS.OFFICE_DATA,
    initialData,
    ttlMs: 5 * 60 * 1000,
    persistKey: "office_data_cache",
    persistMaxAgeMs: 5 * 60 * 1000,
    fetcher: async () => {
      await officeDataStore.initializeDirect()
      const next = officeDataStore.getData()
      if (!next) {
        throw new Error("Failed to load office data")
      }
      return next
    },
    onError: (err) => {
      console.error("Failed to initialize office data:", err)
      const existing = officeDataStore.getData()
      if (existing) {
        setData(existing)
        setError(null)
        setDataInitialized(true)
        return
      }
      setError("Failed to load office data")
    },
  })

  useEffect(() => {
    let mounted = true

    if (!enabled) return () => { mounted = false }

    const unsubscribe = officeDataStore.subscribe(() => {
      if (mounted) {
        const newData = officeDataStore.getData()
        if (newData) {
          setData((prevData: any) => {
            if (prevData?.lastUpdated === newData.lastUpdated) {
              return prevData
            }
            return newData
          })
          setDataInitialized(true)
          setError(null)
        }
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [enabled, setData])

  const hasRenderableData = Boolean(data) || dataInitialized

  return { data, loading: enabled ? loading && !hasRenderableData : false, error }
}

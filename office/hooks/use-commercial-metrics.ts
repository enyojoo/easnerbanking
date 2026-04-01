"use client"

import { useCallback, useEffect, useState } from "react"
import type { CommercialMetrics } from "@/lib/types/commercial"
import { commercialApi } from "@/lib/commercial-api"

export function useCommercialMetrics() {
  const [metrics, setMetrics] = useState<CommercialMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await commercialApi.getMetrics()
      setMetrics(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load metrics")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { metrics, loading, error, refresh }
}

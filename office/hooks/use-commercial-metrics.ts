"use client"

import { useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { commercialApi } from "@/lib/commercial-api"
import { officeKeys } from "@/lib/query/keys"

const STALE_MS = 5 * 60 * 1000

export function useCommercialMetrics() {
  const {
    data: metrics = null,
    isPending,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: officeKeys.commercial.metrics(),
    queryFn: () => commercialApi.getMetrics(),
    staleTime: STALE_MS,
    gcTime: STALE_MS * 2,
  })

  const refresh = useCallback(async () => {
    await refetch()
  }, [refetch])

  return {
    metrics,
    loading: isPending || (isFetching && !metrics),
    error: error instanceof Error ? error.message : error ? String(error) : null,
    refresh,
  }
}

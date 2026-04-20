"use client"

import { useCallback } from "react"
import { useQuery } from "@tanstack/react-query"

interface UseCommercialResourceOptions {
  queryKey: readonly unknown[]
  staleTimeMs?: number
}

export function useCommercialResource<T>(
  loader: () => Promise<T[]>,
  { queryKey, staleTimeMs = 5 * 60 * 1000 }: UseCommercialResourceOptions,
) {
  const {
    data: rows = [],
    isPending,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: loader,
    staleTime: staleTimeMs,
    gcTime: staleTimeMs * 2,
  })

  const refresh = useCallback(async () => {
    await refetch()
  }, [refetch])

  return {
    rows,
    loading: isPending || (isFetching && rows.length === 0),
    error: error instanceof Error ? error.message : error ? String(error) : null,
    refresh,
  }
}

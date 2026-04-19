"use client"

import * as React from "react"
import { useQueryClient, type QueryKey, type FetchQueryOptions } from "@tanstack/react-query"

/**
 * Row-hover prefetch helper.
 *
 * Returns handlers you can spread onto a row element to prefetch the
 * detail query (and optionally cancel on hover-out). Opening the row
 * then reads from the populated cache and renders instantly instead of
 * showing a skeleton.
 *
 * Use with staleTime on the underlying query so repeated hovers don't
 * thrash the network.
 *
 * Example:
 *   const bind = useHoverPrefetch({
 *     queryKey: qk.transactions.detail(scope, tx.id),
 *     queryFn: () => apiFetch(`/api/transactions/${tx.id}`),
 *     staleTime: 30_000,
 *   })
 *   return <tr {...bind}>…</tr>
 */
export function useHoverPrefetch<T>(options: FetchQueryOptions<T, Error, T, QueryKey>) {
  const qc = useQueryClient()
  const timeout = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const onPointerEnter = React.useCallback(() => {
    // Small delay so a user sweeping through a list doesn't trigger
    // dozens of requests just by passing over.
    if (timeout.current) return
    timeout.current = setTimeout(() => {
      timeout.current = null
      void qc.prefetchQuery(options)
    }, 120)
  }, [qc, options])

  const onPointerLeave = React.useCallback(() => {
    if (timeout.current) {
      clearTimeout(timeout.current)
      timeout.current = null
    }
  }, [])

  React.useEffect(() => {
    return () => {
      if (timeout.current) clearTimeout(timeout.current)
    }
  }, [])

  return { onPointerEnter, onPointerLeave }
}

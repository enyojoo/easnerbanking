"use client"

import { useMemo } from "react"
import type { TransactionWithSource } from "@/lib/transactions"
import { useTransactionsList } from "@/hooks/queries/use-transactions"

/**
 * Compat shim over `useTransactionsList`.
 *
 * Several screens already call `useTransactionsCached()` expecting a
 * `{ data, loading }` pair of flat rows. Those screens haven't moved
 * to `useInfiniteQuery` yet, so we keep the old shape and flatten the
 * first infinite page here. New call sites should import
 * `useTransactionsList` directly from `@/hooks/queries`.
 */

export const TRANSACTIONS_LIST_CACHE_TTL_MS = 5 * 60 * 1000

export function useTransactionsCached() {
  const query = useTransactionsList()
  const flattened = useMemo<TransactionWithSource[]>(() => {
    const pages = query.data?.pages ?? []
    return pages.flatMap((p) => p.transactions ?? [])
  }, [query.data])

  return {
    data: flattened,
    loading: query.isPending && flattened.length === 0,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: () => query.refetch(),
    isRefetching: query.isFetching,
  }
}

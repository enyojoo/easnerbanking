"use client"

import { useMemo } from "react"
import { useIsRestoring } from "@tanstack/react-query"
import type { TransactionWithSource } from "@/lib/transactions"
import { useTransactionsList } from "@/hooks/queries/use-transactions"
import { useScope } from "@/lib/query/scope"
import { useIsPostUnlockResumeActive } from "@/lib/post-unlock-resume-context"

/**
 * Compat shim over `useTransactionsList`.
 *
 * Several screens already call `useTransactionsCached()` expecting a
 * `{ data, loading }` pair of flat rows. Those screens haven't moved
 * to `useInfiniteQuery` yet, so we keep the old shape and flatten the
 * first infinite page here. New call sites should import
 * `useTransactionsList` directly from `@/hooks/queries`.
 */

export function useTransactionsCached() {
  const { scope } = useScope()
  const postUnlockResume = useIsPostUnlockResumeActive()
  const isRestoring = useIsRestoring()
  const query = useTransactionsList()
  const flattened = useMemo<TransactionWithSource[]>(() => {
    const pages = query.data?.pages ?? []
    return pages.flatMap((p) => p.transactions ?? [])
  }, [query.data])

  const empty = flattened.length === 0
  const loading =
    Boolean(scope) &&
    empty &&
    !isRestoring &&
    ((query.isPending && !query.data) ||
      query.isLoading ||
      (Boolean(postUnlockResume) && query.isFetching))

  return {
    data: flattened,
    loading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: () => query.refetch(),
    isRefetching: query.isFetching,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
  }
}

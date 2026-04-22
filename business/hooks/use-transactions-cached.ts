"use client"

import { useEffect, useMemo } from "react"
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

export const TRANSACTIONS_LIST_CACHE_TTL_MS = 60 * 60 * 1000
const TRANSACTIONS_LIST_CACHE_KEY = "easner_business_transactions_list_v1"

type TransactionsListCacheEnvelope = {
  at: number
  rows: TransactionWithSource[]
}

function readCachedRows(): TransactionWithSource[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(TRANSACTIONS_LIST_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as TransactionsListCacheEnvelope
    if (!parsed?.at || !Array.isArray(parsed.rows)) return []
    if (Date.now() - Number(parsed.at) > TRANSACTIONS_LIST_CACHE_TTL_MS) return []
    return parsed.rows
  } catch {
    return []
  }
}

export function useTransactionsCached() {
  const query = useTransactionsList()
  const cachedRows = useMemo(readCachedRows, [])
  const flattened = useMemo<TransactionWithSource[]>(() => {
    const pages = query.data?.pages ?? []
    const liveRows = pages.flatMap((p) => p.transactions ?? [])
    if (liveRows.length > 0) return liveRows
    return cachedRows
  }, [cachedRows, query.data])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (flattened.length === 0) return
    try {
      const payload: TransactionsListCacheEnvelope = {
        at: Date.now(),
        rows: flattened.slice(0, 200),
      }
      window.localStorage.setItem(TRANSACTIONS_LIST_CACHE_KEY, JSON.stringify(payload))
    } catch {
      // Ignore storage write failures.
    }
  }, [flattened])

  return {
    data: flattened,
    loading: query.isPending && flattened.length === 0,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: () => query.refetch(),
    isRefetching: query.isFetching,
  }
}

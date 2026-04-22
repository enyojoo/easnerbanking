"use client"

import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { qk, type TxFilters, type Scope } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import type { TransactionWithSource } from "@/lib/transactions"
import { useScope } from "@/lib/query/scope"

const LEDGER_BUSINESS_HEADERS = { "X-Easner-Noah-Scope": "business" } as const

interface TransactionsPage {
  transactions: TransactionWithSource[]
  nextCursor: string | null
}

/**
 * Paginated ledger for the active scope.
 *
 * - SWR window is 30s; the realtime bridge prepends posted rows without
 *   refetching, so we rarely hit the network while browsing.
 * - `placeholderData: keepPreviousData` is inherited from `createBaseQueryClient`
 *   so filter changes don't blink back to a skeleton.
 * - Marked `safePersist` for mobile persistence parity, harmless on web.
 */
export function useTransactionsList(filters: TxFilters = {}) {
  const { scope } = useScope()
  return useInfiniteQuery({
    queryKey: scope ? qk.transactions.list(scope, filters) : ["transactions", "disabled"],
    enabled: Boolean(scope),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const body = await apiFetch<{ transactions: TransactionWithSource[] }>("/api/transactions", {
        query: {
          ...filters,
          cursor: pageParam ?? undefined,
          limit: 50,
        },
        headers: { ...LEDGER_BUSINESS_HEADERS },
      })
      return {
        transactions: body.transactions ?? [],
        nextCursor: null,
      } satisfies TransactionsPage
    },
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    meta: { safePersist: true, webPersist: "reduced", freshness: "operational" },
  })
}

/**
 * Single transaction detail, typically prefetched on row hover and
 * reconciled by the realtime bridge when the server posts an UPDATE.
 */
export function useTransactionDetail(txId: string | null) {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope && txId ? qk.transactions.detail(scope, txId) : ["transactions", "detail", "disabled"],
    enabled: Boolean(scope) && Boolean(txId),
    queryFn: () => apiFetch<TransactionWithSource>(`/api/transactions/${txId}`),
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    meta: { safePersist: false, webPersist: "none", freshness: "operational" },
  })
}

export type { TransactionsPage }
export function useTransactionsFirstPageKey(scope: Scope, filters: TxFilters = {}) {
  return qk.transactions.list(scope, filters)
}

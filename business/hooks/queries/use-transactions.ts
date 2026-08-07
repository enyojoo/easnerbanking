"use client"

import type { InfiniteData, QueryClient } from "@tanstack/react-query"
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { qk, scopeKey, type TxFilters, type Scope, pollingIntervalFor } from "@easner/shared"
import { apiFetch, ApiError } from "@/lib/query/api-client"
import type { TransactionWithSource } from "@/lib/transactions"
import { normalizeEasnerTransactionIdForLookup } from "@/lib/easner-transaction-id"
import { useScope } from "@/lib/query/scope"
import { useRealtimeHealth } from "@/lib/query/realtime-health-context"
import { useDocumentVisibility } from "@/lib/query/use-document-visibility"

const LEDGER_BUSINESS_HEADERS = { "X-Easner-Account-Scope": "business" } as const

/** First page size for the unified ledger list. */
export const BUSINESS_TRANSACTIONS_LIST_PAGE_SIZE = 50 as const
/** @deprecated Use BUSINESS_TRANSACTIONS_LIST_PAGE_SIZE */
export const BUSINESS_TRANSACTIONS_LIST_LIMIT = BUSINESS_TRANSACTIONS_LIST_PAGE_SIZE as const

export interface TransactionsPage {
  transactions: TransactionWithSource[]
  nextCursor: string | null
}

function transactionIdsMatchLookup(txId: string, rowId: string): boolean {
  const a = normalizeEasnerTransactionIdForLookup(txId) ?? txId
  const b = normalizeEasnerTransactionIdForLookup(rowId) ?? rowId
  return a.toLowerCase() === b.toLowerCase()
}

/**
 * Find a row from any in-memory transactions list query (any filters) to seed detail UI.
 */
export function findTransactionInCachedLists(
  queryClient: QueryClient,
  scope: Scope,
  txId: string,
): TransactionWithSource | undefined {
  const entries = queryClient.getQueriesData<InfiniteData<TransactionsPage>>({
    queryKey: [...scopeKey(scope), "transactions", "list"],
    exact: false,
  })
  for (const [, data] of entries) {
    if (!data?.pages?.length) continue
    for (const page of data.pages) {
      for (const t of page.transactions) {
        if (transactionIdsMatchLookup(txId, t.id)) return t
      }
    }
  }
  return undefined
}

export async function fetchBusinessTransactionDetail(txId: string): Promise<TransactionWithSource> {
  const body = await apiFetch<{ businessTransaction?: TransactionWithSource; transaction?: unknown }>(
    `/api/transactions/${encodeURIComponent(txId)}`,
  )
  if (body.businessTransaction) return body.businessTransaction
  throw new ApiError("Missing business transaction payload", 502, null, body)
}

/** Options shared by `useTransactionDetail`, hover prefetch, and `prefetchQuery`. */
export function getTransactionDetailPrefetchOptions(scope: Scope, txId: string) {
  return {
    queryKey: qk.transactions.detail(scope, txId),
    queryFn: () => fetchBusinessTransactionDetail(txId),
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    meta: { safePersist: true, webPersist: "reduced", freshness: "operational" as const },
  }
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
  const realtimeHealth = useRealtimeHealth()
  const tabVisible = useDocumentVisibility()
  const listFilters: TxFilters = { ...filters, limit: BUSINESS_TRANSACTIONS_LIST_PAGE_SIZE }
  return useInfiniteQuery({
    queryKey: scope ? qk.transactions.list(scope, listFilters) : ["transactions", "disabled"],
    enabled: Boolean(scope),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const body = await apiFetch<{ transactions: TransactionWithSource[]; nextCursor?: string | null }>(
        "/api/transactions",
        {
          query: {
            ...filters,
            cursor: pageParam ?? undefined,
            limit: BUSINESS_TRANSACTIONS_LIST_PAGE_SIZE,
          },
          headers: { ...LEDGER_BUSINESS_HEADERS },
        },
      )
      return {
        transactions: body.transactions ?? [],
        nextCursor: body.nextCursor ?? null,
      } satisfies TransactionsPage
    },
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 90_000,
    gcTime: 30 * 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchInterval: tabVisible ? pollingIntervalFor("operational", realtimeHealth) : false,
    refetchIntervalInBackground: false,
    meta: { safePersist: true, webPersist: "reduced", freshness: "operational" },
  })
}

/**
 * Single transaction detail — same cache/TTL/persistence band as list (`webPersist: reduced`).
 * Seeds from any cached transactions list row via `placeholderData` for instant navigation.
 */
export function useTransactionDetail(txId: string | null) {
  const { scope } = useScope()
  const queryClient = useQueryClient()
  const opts = scope && txId ? getTransactionDetailPrefetchOptions(scope, txId) : null

  return useQuery({
    ...(opts ?? {
      queryKey: ["transactions", "detail", "disabled"] as const,
      queryFn: async (): Promise<TransactionWithSource> => {
        throw new Error("Transaction detail query disabled")
      },
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      meta: { safePersist: false, webPersist: "none" as const, freshness: "operational" as const },
    }),
    enabled: Boolean(opts),
    placeholderData: (previousData) => {
      if (previousData) return previousData
      if (!scope || !txId) return undefined
      return findTransactionInCachedLists(queryClient, scope, txId)
    },
  })
}

export function useTransactionsFirstPageKey(scope: Scope, filters: TxFilters = {}) {
  return qk.transactions.list(scope, { ...filters, limit: BUSINESS_TRANSACTIONS_LIST_LIMIT })
}

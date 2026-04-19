import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { qk, type TxFilters } from '@easner/shared'
import { apiFetch } from '../../query/api-client'
import { useScope } from '../../query/scope'
import { NOAH_SCOPE_INDIVIDUAL_HEADERS } from '../../lib/apiClient'

/**
 * Paginated personal transactions ledger for Easner mobile.
 *
 * - `safePersist: true` so the last page shows immediately on cold launch
 *   (non-sensitive list metadata only; not balances).
 * - SWR window is 45s; the realtime bridge prepends new rows without a
 *   refetch, so normal browsing rarely hits the network.
 */

export type MobileTransactionRow = {
  id?: string
  transaction_id?: string
  currency?: string
  amount?: string | number
  status?: string
  direction?: 'credit' | 'debit'
  transaction_type?: 'send' | 'receive' | string
  created_at?: string
  noah_created_at?: string
  name?: string
  description?: string | null
  [key: string]: unknown
}

interface TransactionsResponse {
  transactions?: MobileTransactionRow[]
}

export function useTransactionsList(filters: TxFilters = {}, pageSize = 25) {
  const { scope } = useScope()
  return useInfiniteQuery({
    queryKey: scope ? qk.transactions.list(scope, filters) : ['transactions', 'disabled'],
    enabled: Boolean(scope),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const body = await apiFetch<TransactionsResponse>('/api/transactions', {
        query: {
          ...filters,
          cursor: pageParam ?? undefined,
          limit: pageSize,
        },
        headers: { ...NOAH_SCOPE_INDIVIDUAL_HEADERS },
      })
      return {
        transactions: body.transactions ?? [],
        nextCursor: null as string | null,
      }
    },
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 45_000,
    gcTime: 30 * 60_000,
    meta: { safePersist: true, freshness: 'operational' },
  })
}

export function useTransactionDetail(txId: string | null) {
  const { scope } = useScope()
  return useQuery({
    queryKey:
      scope && txId
        ? qk.transactions.detail(scope, txId)
        : ['transactions', 'detail', 'disabled'],
    enabled: Boolean(scope) && Boolean(txId),
    queryFn: () =>
      apiFetch<MobileTransactionRow>(`/api/transactions/${txId}`, {
        headers: { ...NOAH_SCOPE_INDIVIDUAL_HEADERS },
      }),
    staleTime: 45_000,
    gcTime: 10 * 60_000,
    meta: { safePersist: false, freshness: 'operational' },
  })
}

import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { qk, type TxFilters } from '@easner/shared'
import { apiFetch } from '../../query/api-client'
import { useScope } from '../../query/scope'
import { NOAH_SCOPE_INDIVIDUAL_HEADERS } from '../../lib/apiClient'
import type { Transaction } from '../../types'

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

/** Maps unified `/api/transactions` list rows to legacy `Transaction` for stats / send hub. */
export function mapLedgerRowToTransaction(userId: string, row: Record<string, unknown>): Transaction {
  const amount = Number(row.amount ?? 0)
  return {
    id: String(row.id ?? row.transaction_id ?? ''),
    user_id: userId,
    recipient_id: typeof row.recipient_id === 'string' ? row.recipient_id : undefined,
    send_amount: amount,
    send_currency: String(row.currency ?? 'USD'),
    receive_amount: Number(row.final_amount ?? row.amount ?? 0),
    receive_currency: String(row.currency ?? 'USD'),
    exchange_rate: Number(row.exchange_rate ?? 1),
    fee_amount: Number(row.fee_amount ?? 0),
    fee_type: String(row.fee_type ?? ''),
    total_amount: amount,
    transaction_id: String(row.transaction_id ?? row.id ?? ''),
    noah_transaction_id: String(row.noah_transaction_id ?? row.transaction_id ?? row.id ?? ''),
    status: String(row.status ?? 'pending') as Transaction['status'],
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
    metadata: (row.metadata as Record<string, unknown> | undefined) ?? undefined,
  }
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
      apiFetch<{ transaction?: MobileTransactionRow }>(`/api/transactions/${txId}`, {
        headers: { ...NOAH_SCOPE_INDIVIDUAL_HEADERS },
      }),
    staleTime: 45_000,
    gcTime: 10 * 60_000,
    meta: { safePersist: false, freshness: 'operational' },
  })
}

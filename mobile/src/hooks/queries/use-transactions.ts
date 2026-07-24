import {
  useInfiniteQuery,
  useQuery,
  type QueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query'
import { Platform } from 'react-native'
import { qk, type Scope, type TxFilters, pollingIntervalFor } from '@easner/shared'
import { apiFetch } from '../../query/api-client'
import { useScope } from '../../query/scope'
import { useRealtimeHealth } from '../../query/realtime-health-context'
import { useDocumentVisibility } from '../useDocumentVisibility'
import { NOAH_SCOPE_INDIVIDUAL_HEADERS } from '../../lib/apiClient'
import {
  readCachedTransactionDetail,
  writeCachedTransactionDetail,
} from '../../lib/transactionDetailCache'
import { CacheTTL } from '../../lib/userCache'
import type { Transaction } from '../../types'

/**
 * Paginated personal transactions ledger for Easner mobile.
 *
 * - `safePersist: true` so the last page shows immediately on cold launch
 *   (non-sensitive list metadata only; not balances).
 * - SWR window is 45s; the realtime bridge invalidates this cache when
 *   `transactions` or `wallet_balances` change so lists stay aligned with balance.
 */

export type MobileTransactionRow = {
  id?: string
  transaction_id?: string
  /** Supabase `transactions.id` — preferred when opening detail (display id may be synthetic). */
  ledger_row_id?: string
  currency?: string
  amount?: string | number
  account_impact_amount?: number
  account_impact_currency?: string
  ledger_amount?: number
  ledger_currency?: string
  status?: string
  direction?: 'credit' | 'debit'
  transaction_type?: 'send' | 'receive' | string
  created_at?: string
  noah_created_at?: string
  name?: string
  description?: string | null
  transaction_product?: string
  sender_display_name?: string
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
  nextCursor?: string | null
}

/**
 * Single page size for the unified ledger list on mobile.
 * Home dashboard only displays the first four rows — it uses this same query so cache is shared with the
 * Transactions tab (no second cold fetch / endless skeleton).
 */
export const TRANSACTIONS_LEDGER_PAGE_SIZE = 50

/** Detail rows are immutable ledger snapshots — keep warm for 7d (disk + memory). */
export const TRANSACTION_DETAIL_STALE_MS = CacheTTL.TRANSACTION_DETAIL
export const TRANSACTION_DETAIL_GC_MS = CacheTTL.TRANSACTION_DETAIL

/**
 * When prefetching from list rows / press-in, always hit the network in the
 * background even if the 7d display cache is still fresh.
 */
export const TRANSACTION_DETAIL_BACKGROUND_REFETCH_MS = 0

export type TransactionDetailResponse = { transaction?: MobileTransactionRow }

export function unwrapTransactionDetailPayload(
  data: TransactionDetailResponse | MobileTransactionRow | undefined,
): MobileTransactionRow | null {
  if (!data) return null
  return ((data as TransactionDetailResponse).transaction ?? data) as MobileTransactionRow
}

async function fetchTransactionDetail(scope: Scope, txId: string): Promise<TransactionDetailResponse> {
  const body = await apiFetch<TransactionDetailResponse>(
    `/api/transactions/${encodeURIComponent(txId)}`,
    {
      headers: { ...NOAH_SCOPE_INDIVIDUAL_HEADERS },
    },
  )
  void writeCachedTransactionDetail(txId, body).catch(() => {
    // Best-effort disk cache for instant reopen after stale navigation.
  })
  return body
}

export function transactionDetailQueryOptions(
  scope: Scope,
  txId: string,
): UseQueryOptions<TransactionDetailResponse, Error, TransactionDetailResponse> {
  return {
    queryKey: qk.transactions.detail(scope, txId),
    queryFn: () => fetchTransactionDetail(scope, txId),
    staleTime: TRANSACTION_DETAIL_STALE_MS,
    gcTime: TRANSACTION_DETAIL_GC_MS,
    meta: { safePersist: true, freshness: 'operational' },
    placeholderData: (previousData) => previousData,
    // Global mobile client sets refetchOnMount: false — override here so cached
    // detail renders instantly, then enrichment refreshes in the background.
    refetchOnMount: 'always',
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  }
}

/** Warm detail cache from disk before the network round-trip (e.g. on press-in). */
export async function seedTransactionDetailFromDisk(
  qc: QueryClient,
  scope: Scope,
  txId: string,
): Promise<void> {
  if (!txId.trim()) return
  const key = qk.transactions.detail(scope, txId.trim())
  if (qc.getQueryData(key)) return
  const cached = await readCachedTransactionDetail<TransactionDetailResponse>(txId.trim())
  if (!cached) return
  qc.setQueryData(key, cached)
}

/**
 * Central warm-up for list press-in, push taps, and PIN prefetch.
 * Seeds disk under ledger id + aliases (ETID), optionally hydrates from push snapshot, then prefetches API.
 */
export async function warmTransactionDetailForNavigation(
  qc: QueryClient,
  scope: Scope,
  txId: string,
  opts?: {
    aliasIds?: string[]
    pushSnapshot?: MobileTransactionRow | null
  },
): Promise<void> {
  const id = txId.trim()
  if (!id || id.startsWith('optimistic_')) return

  const aliasIds = [...new Set([...(opts?.aliasIds ?? []).map((a) => a.trim()).filter(Boolean)])]
  for (const alias of aliasIds) {
    await seedTransactionDetailFromDisk(qc, scope, alias)
  }
  await seedTransactionDetailFromDisk(qc, scope, id)

  if (opts?.pushSnapshot) {
    const response: TransactionDetailResponse = { transaction: opts.pushSnapshot }
    const key = qk.transactions.detail(scope, id)
    if (!qc.getQueryData(key)) {
      qc.setQueryData(key, response)
    }
    const cacheIds = [id, ...aliasIds.filter((a) => a !== id)]
    for (const cacheId of cacheIds) {
      void writeCachedTransactionDetail(cacheId, response).catch(() => undefined)
    }
  }

  await prefetchTransactionDetail(qc, scope, id)
}

export function prefetchTransactionDetail(
  qc: QueryClient,
  scope: Scope,
  txId: string,
): Promise<void> {
  const id = txId.trim()
  if (!id || id.startsWith("optimistic_")) return Promise.resolve()
  void seedTransactionDetailFromDisk(qc, scope, txId)
  return qc
    .prefetchQuery({
      ...transactionDetailQueryOptions(scope, txId),
      staleTime: TRANSACTION_DETAIL_BACKGROUND_REFETCH_MS,
    })
    .then(() => undefined)
}

/** Prefer ledger UUID for detail API — list `transaction_id` may be display-only (ETID…). */
export function transactionDetailLookupId(row: {
  ledger_row_id?: string
  transaction_id?: string
  id?: string
}): string {
  const ledger = typeof row.ledger_row_id === 'string' ? row.ledger_row_id.trim() : ''
  if (ledger) return ledger
  return String(row.transaction_id || row.id || '').trim()
}

/** Prefetch enriched detail for recent ledger rows without blocking UI. */
export function prefetchRecentTransactionDetailsInBackground(
  qc: QueryClient,
  scope: Scope,
  rows: Array<{ ledger_row_id?: string; transaction_id?: string; id?: string }>,
  limit = 30,
): void {
  for (const row of rows.slice(0, limit)) {
    const txId = transactionDetailLookupId(row)
    if (!txId) continue
    void prefetchTransactionDetail(qc, scope, txId)
  }
}

export function useTransactionsList(filters: TxFilters = {}, pageSize = TRANSACTIONS_LEDGER_PAGE_SIZE) {
  const { scope } = useScope()
  const realtimeHealth = useRealtimeHealth()
  const tabVisible = useDocumentVisibility()
  const listFilters: TxFilters = { ...filters, limit: pageSize }
  const pollActive = Platform.OS === 'web' ? tabVisible : true
  return useInfiniteQuery({
    queryKey: scope ? qk.transactions.list(scope, listFilters) : ['transactions', 'disabled'],
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
        nextCursor: body.nextCursor ?? null,
      }
    },
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 90_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: pollActive ? pollingIntervalFor('operational', realtimeHealth) : false,
    refetchIntervalInBackground: false,
    meta: { safePersist: true, freshness: 'operational' },
  })
}

export function useTransactionDetail(txId: string | null) {
  const { scope } = useScope()
  return useQuery({
    ...(scope && txId
      ? transactionDetailQueryOptions(scope, txId)
      : {
          queryKey: ['transactions', 'detail', 'disabled'] as const,
          queryFn: async () => ({}) as TransactionDetailResponse,
        }),
    enabled: Boolean(scope) && Boolean(txId),
  })
}

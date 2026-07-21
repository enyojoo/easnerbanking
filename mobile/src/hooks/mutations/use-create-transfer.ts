import { useMutation, useQueryClient } from '@tanstack/react-query'
import { markRecentMoneyActivity, qk, scopeKey } from '@easner/shared'
import { apiFetch } from '../../query/api-client'
import { useScope } from '../../query/scope'
import type { MobileTransactionRow } from '../queries/use-transactions'

/**
 * Personal send/transfer mutation for Easner mobile.
 *
 * Pessimistic for the network call (we need a Noah transfer id before we
 * trust anything authoritative) but optimistic for the ledger row so the
 * user sees their transfer appear instantly. Balances are NEVER touched
 * here — balances only move when the realtime bridge delivers a
 * `wallet_balances` event.
 */

export interface PersonalTransferInput {
  amount: string
  currency: string
  formSessionId: string
  cryptoAuthorizedAmount: string
  cryptoCurrency: string
  countryCode: string
  channelId?: string
  recipientId?: string
  note?: string
  memo?: string
  reservedDebitEtid?: string
  idempotencyKey?: string
}

export interface PersonalTransferResult {
  id: string
  amount: string
  currency: string
  status: string
  transaction_id?: string
}

type InfinitePages = {
  pages: Array<{ transactions: MobileTransactionRow[]; nextCursor: string | null }>
  pageParams: unknown[]
}

export function useCreateTransfer() {
  const qc = useQueryClient()
  const { scope } = useScope()

  return useMutation({
    meta: { intent: 'create transfer', destructive: true },
    mutationFn: (input: PersonalTransferInput) =>
      apiFetch<PersonalTransferResult>('/api/transfers', {
        method: 'POST',
        body: {
          amount: input.amount,
          currency: input.currency,
          formSessionId: input.formSessionId,
          cryptoAuthorizedAmount: input.cryptoAuthorizedAmount,
          cryptoCurrency: input.cryptoCurrency,
          countryCode: input.countryCode,
          ...(input.channelId ? { channelId: input.channelId } : {}),
          ...(input.recipientId ? { recipientId: input.recipientId } : {}),
          ...(input.note ? { note: input.note } : {}),
          ...(input.reservedDebitEtid ? { reservedDebitEtid: input.reservedDebitEtid } : {}),
        },
        headers:
          input.idempotencyKey || input.reservedDebitEtid
            ? { 'Idempotency-Key': input.idempotencyKey ?? input.reservedDebitEtid! }
            : undefined,
      }),
    onMutate: async (input) => {
      // Temporarily speed fallback polling right after money movement.
      markRecentMoneyActivity()
      if (!scope) return {}
      await qc.cancelQueries({ queryKey: qk.transactions.root(scope) })
      const optimisticId = `optimistic_${Date.now()}`
      const optimisticRow: MobileTransactionRow = {
        id: optimisticId,
        transaction_id: optimisticId,
        transaction_type: 'send',
        amount: input.amount,
        currency: input.currency,
        status: 'pending',
        created_at: new Date().toISOString(),
        noah_created_at: new Date().toISOString(),
        direction: 'debit',
        name: 'Transfer',
        description: input.memo ?? null,
      }
      const entries = qc.getQueriesData<InfinitePages>({
        queryKey: [...scopeKey(scope), 'transactions', 'list'],
        exact: false,
      })
      const prevSnapshots = entries.map(([key, data]) => [key, data] as const)
      for (const [key, data] of entries) {
        if (!data?.pages?.length) continue
        const [first, ...rest] = data.pages
        qc.setQueryData<InfinitePages>(key, {
          ...data,
          pages: [
            { ...first, transactions: [optimisticRow, ...first.transactions] },
            ...rest,
          ],
        })
      }
      return { prevSnapshots, optimisticId }
    },
    onError: (_err, _input, ctx) => {
      if (!scope || !ctx?.prevSnapshots) return
      for (const [key, data] of ctx.prevSnapshots) {
        qc.setQueryData(key, data)
      }
    },
    onSettled: () => {
      if (!scope) return
      qc.invalidateQueries({ queryKey: qk.transactions.root(scope), refetchType: 'active' })
      qc.invalidateQueries({ queryKey: qk.transactions.root(scope), refetchType: 'inactive' })
      qc.invalidateQueries({ queryKey: qk.wallets.list(scope), refetchType: 'active' })
      qc.invalidateQueries({ queryKey: qk.wallets.list(scope), refetchType: 'inactive' })
    },
  })
}

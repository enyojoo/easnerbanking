import { useMutation, useQueryClient } from '@tanstack/react-query'
import { qk } from '@easner/shared'
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
  sourceWalletId: string
  destinationExternalAccountId?: string
  formSessionId?: string
  cryptoAuthorizedAmount?: string
  cryptoCurrency?: string
  memo?: string
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
      apiFetch<PersonalTransferResult>('/api/noah/transfers', {
        method: 'POST',
        body: {
          amount: input.amount,
          currency: input.currency,
          sourceWalletId: input.sourceWalletId,
          destinationExternalAccountId: input.destinationExternalAccountId,
          formSessionId: input.formSessionId,
          cryptoAuthorizedAmount: input.cryptoAuthorizedAmount,
          cryptoCurrency: input.cryptoCurrency,
        },
        headers: input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : undefined,
      }),
    onMutate: async (input) => {
      if (!scope) return {}
      const listKey = qk.transactions.list(scope, {})
      await qc.cancelQueries({ queryKey: qk.transactions.root(scope) })
      const prev = qc.getQueryData<InfinitePages>(listKey)
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
      if (prev && prev.pages.length > 0) {
        const [first, ...rest] = prev.pages
        qc.setQueryData<InfinitePages>(listKey, {
          ...prev,
          pages: [
            { ...first, transactions: [optimisticRow, ...first.transactions] },
            ...rest,
          ],
        })
      }
      return { prev, optimisticId }
    },
    onError: (_err, _input, ctx) => {
      if (!scope || !ctx?.prev) return
      qc.setQueryData(qk.transactions.list(scope, {}), ctx.prev)
    },
    onSettled: () => {
      if (!scope) return
      qc.invalidateQueries({ queryKey: qk.transactions.root(scope), refetchType: 'inactive' })
      qc.invalidateQueries({ queryKey: qk.wallets.list(scope), refetchType: 'inactive' })
    },
  })
}

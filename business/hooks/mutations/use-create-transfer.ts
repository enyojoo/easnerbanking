"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { markRecentMoneyActivity, qk } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"
import { BUSINESS_TRANSACTIONS_LIST_LIMIT, type TransactionsPage } from "@/hooks/queries/use-transactions"
import type { TransactionWithSource } from "@/lib/transactions"

export interface CreateTransferInput {
  fromWalletId: string
  toBeneficiaryId?: string
  toWalletId?: string
  amount: number
  currency: string
  memo?: string
  /** Optional idempotency key provided by the caller. */
  idempotencyKey?: string
}

export interface CreateTransferResult {
  transaction: TransactionWithSource
}

/**
 * Create internal/international transfer – pessimistic for the create
 * itself (we must have a server-minted id before showing anything
 * authoritative) but optimistic for the ledger row presence.
 *
 * Flow:
 *   1. Prepend a synthetic "pending" row into the first page with
 *      status `pending` and `_optimisticId`, so the user sees the
 *      transfer appear immediately.
 *   2. On success, swap the optimistic row for the server row.
 *   3. On error, remove the optimistic row and surface a toast.
 *   4. Balance numbers are NEVER touched here – balances only move
 *      when a `wallet_balances` realtime event fires.
 */
export function useCreateTransfer() {
  const qc = useQueryClient()
  const { scope } = useScope()

  return useMutation({
    meta: { intent: "create transfer", destructive: true },
    mutationFn: (input: CreateTransferInput) =>
      apiFetch<CreateTransferResult>("/api/business/transfers", {
        method: "POST",
        body: input,
        headers: input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : undefined,
      }),
    onMutate: async (input) => {
      // Temporarily speed fallback polling right after money movement.
      markRecentMoneyActivity()
      if (!scope) return {}
      const listKey = qk.transactions.list(scope, { limit: BUSINESS_TRANSACTIONS_LIST_LIMIT })
      await qc.cancelQueries({ queryKey: qk.transactions.root(scope) })
      const prev = qc.getQueryData<{ pages: TransactionsPage[]; pageParams: unknown[] }>(listKey)
      const optimisticId = `optimistic_${Date.now()}`
      // The runtime shape of transactions on the list endpoint is richer
      // than the static `Transaction` interface (includes `transaction_type`,
      // `noah_created_at`, etc.). We build a loose object that matches what
      // existing screens read, then cast through `unknown` for type-safety
      // at the boundary.
      const optimisticRow = {
        id: optimisticId,
        transaction_id: optimisticId,
        type: "send",
        transaction_type: "send",
        amount: input.amount,
        currency: input.currency,
        status: "pending" as const,
        created_at: new Date().toISOString(),
        noah_created_at: new Date().toISOString(),
        description: input.memo ?? "Transfer",
        name: "Transfer",
        direction: "debit" as const,
        _optimistic: true,
      } as unknown as TransactionWithSource & { _optimistic?: true }

      if (prev && prev.pages.length > 0) {
        const [first, ...rest] = prev.pages
        qc.setQueryData(listKey, {
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
      if (!scope) return
      if (ctx?.prev) qc.setQueryData(qk.transactions.list(scope, { limit: BUSINESS_TRANSACTIONS_LIST_LIMIT }), ctx.prev)
    },
    onSuccess: (data, _input, ctx) => {
      if (!scope) return
      const listKey = qk.transactions.list(scope, { limit: BUSINESS_TRANSACTIONS_LIST_LIMIT })
      // Swap optimistic row for the server row in the first page.
      const current = qc.getQueryData<{ pages: TransactionsPage[]; pageParams: unknown[] }>(listKey)
      if (!current || current.pages.length === 0) return
      const [first, ...rest] = current.pages
      qc.setQueryData(listKey, {
        ...current,
        pages: [
          {
            ...first,
            transactions: first.transactions
              .filter((r) => (r as { id?: string }).id !== ctx?.optimisticId)
              .some((r) => r.id === data.transaction.id)
              ? first.transactions.filter((r) => (r as { id?: string }).id !== ctx?.optimisticId)
              : [data.transaction, ...first.transactions.filter((r) => (r as { id?: string }).id !== ctx?.optimisticId)],
          },
          ...rest,
        ],
      })
    },
    onSettled: () => {
      if (!scope) return
      // Narrow invalidation: realtime will also fire `transactions.posted`,
      // but we invalidate the first page defensively so the next interaction
      // reflects server truth.
      qc.invalidateQueries({ queryKey: qk.transactions.root(scope), refetchType: "inactive" })
      qc.invalidateQueries({ queryKey: qk.wallets.list(scope), refetchType: "inactive" })
    },
  })
}

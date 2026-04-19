"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"
import type { TransactionWithSource } from "@/lib/transactions"

/**
 * Categorize/tag a transaction. Non-destructive, fully optimistic.
 * Rolls back the detail cache and patches the row in any active list
 * pages if the server rejects.
 */
export function useTagTransaction() {
  const qc = useQueryClient()
  const { scope } = useScope()

  return useMutation({
    meta: { intent: "tag transaction", destructive: false },
    mutationFn: (input: { txId: string; category: string }) =>
      apiFetch<TransactionWithSource>(`/api/transactions/${input.txId}/categorize`, {
        method: "POST",
        body: { category: input.category },
      }),
    onMutate: async ({ txId, category }) => {
      if (!scope) return {}
      const key = qk.transactions.detail(scope, txId)
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<TransactionWithSource>(key)
      if (prev) {
        qc.setQueryData<TransactionWithSource>(key, { ...prev, category })
      }
      return { prev }
    },
    onError: (_err, { txId }, ctx) => {
      if (!scope) return
      if (ctx?.prev) qc.setQueryData(qk.transactions.detail(scope, txId), ctx.prev)
    },
    onSettled: (_data, _err, { txId }) => {
      if (!scope) return
      qc.invalidateQueries({ queryKey: qk.transactions.detail(scope, txId) })
    },
  })
}

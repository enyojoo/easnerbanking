"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"
import type { CardRow } from "@/hooks/queries/use-cards"

/**
 * Freeze/unfreeze card – optimistic pattern from plan §9.
 *
 * - Snapshot current card state.
 * - Flip status immediately with a `pending: true` marker (UX can show
 *   a pending badge).
 * - Server round-trip confirms; on error we roll back via `ctx.prev`.
 * - `onSettled` invalidates the detail key so the realtime event
 *   (or the next fetch) can reconcile.
 */
export function useFreezeCard() {
  const qc = useQueryClient()
  const { scope } = useScope()

  return useMutation({
    meta: { intent: "freeze card", destructive: false },
    mutationFn: async ({ cardId, frozen }: { cardId: string; frozen: boolean }) => {
      return apiFetch<CardRow>(`/api/business/cards/${cardId}/${frozen ? "freeze" : "unfreeze"}`, {
        method: "POST",
      })
    },
    onMutate: async ({ cardId, frozen }) => {
      if (!scope) return {}
      const key = qk.cards.detail(scope, cardId)
      const listKey = qk.cards.list(scope)
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<CardRow>(key)
      if (prev) {
        qc.setQueryData<CardRow>(key, {
          ...prev,
          status: frozen ? "frozen" : "active",
        })
      }
      const prevList = qc.getQueryData<{ cards: CardRow[] }>(listKey)
      if (prevList) {
        qc.setQueryData<{ cards: CardRow[] }>(listKey, {
          ...prevList,
          cards: prevList.cards.map((c) =>
            c.id === cardId ? { ...c, status: frozen ? "frozen" : "active" } : c,
          ),
        })
      }
      return { prev, prevList }
    },
    onError: (_err, { cardId }, ctx) => {
      if (!scope) return
      if (ctx?.prev) qc.setQueryData(qk.cards.detail(scope, cardId), ctx.prev)
      if (ctx?.prevList) qc.setQueryData(qk.cards.list(scope), ctx.prevList)
    },
    onSettled: (_data, _err, { cardId }) => {
      if (!scope) return
      qc.invalidateQueries({ queryKey: qk.cards.detail(scope, cardId) })
      qc.invalidateQueries({ queryKey: qk.cards.list(scope), refetchType: "inactive" })
    },
  })
}

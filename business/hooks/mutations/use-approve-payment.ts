"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"
import type { ApprovalRow } from "@/hooks/queries/use-approvals"

/**
 * Approve or reject a pending payment/transfer.
 *
 * Optimistic: remove the row from the open queue immediately. On error
 * we re-insert it at the original index and surface a toast. Final
 * reconciliation comes from the realtime `approvals` channel.
 */
export function useApprovePayment() {
  const qc = useQueryClient()
  const { scope } = useScope()

  return useMutation({
    meta: { intent: "approve payment", destructive: true },
    mutationFn: (input: { approvalId: string; decision: "approve" | "reject"; reason?: string }) =>
      apiFetch<{ approval: ApprovalRow }>(
        `/api/business/approvals/${input.approvalId}/${input.decision}`,
        { method: "POST", body: { reason: input.reason } },
      ),
    onMutate: async ({ approvalId }) => {
      if (!scope) return {}
      const key = qk.approvals.queue(scope, "open")
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<{ approvals: ApprovalRow[] }>(key)
      if (prev) {
        qc.setQueryData<{ approvals: ApprovalRow[] }>(key, {
          ...prev,
          approvals: prev.approvals.filter((a) => a.id !== approvalId),
        })
      }
      return { prev }
    },
    onError: (_err, _input, ctx) => {
      if (!scope) return
      if (ctx?.prev) qc.setQueryData(qk.approvals.queue(scope, "open"), ctx.prev)
    },
    onSettled: () => {
      if (!scope) return
      qc.invalidateQueries({ queryKey: qk.approvals.root(scope) })
      qc.invalidateQueries({ queryKey: qk.transactions.root(scope), refetchType: "inactive" })
    },
  })
}

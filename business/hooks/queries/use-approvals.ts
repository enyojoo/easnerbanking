"use client"

import { useQuery } from "@tanstack/react-query"
import { qk, type ApprovalStatus } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"

export interface ApprovalRow {
  id: string
  status: ApprovalStatus
  amount: number
  currency: string
  requester_id: string
  created_at: string
  updated_at: string
  subject_type: "transfer" | "payout" | "invoice" | "card"
  subject_id: string
  memo: string | null
}

/**
 * Approval queue for the active scope.
 *
 * 20s staleTime with a 60s background fallback — realtime events on
 * `approvals` narrow-invalidate this queue so the count badge and
 * inline list stay truthful without hammering the server.
 */
export function useApprovalsQueue(status: ApprovalStatus = "open") {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? qk.approvals.queue(scope, status) : ["approvals", "disabled"],
    enabled: Boolean(scope),
    queryFn: () =>
      apiFetch<{ approvals: ApprovalRow[] }>("/api/business/approvals", {
        query: { status },
      }),
    staleTime: 20_000,
    gcTime: 10 * 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    meta: { safePersist: false, freshness: "operational" },
  })
}

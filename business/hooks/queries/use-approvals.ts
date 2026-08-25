"use client"

import { useQuery } from "@tanstack/react-query"
import { qk, type ApprovalStatus, pollingIntervalFor } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"
import { useRealtimeHealth } from "@/lib/query/realtime-health-context"
import { useDocumentVisibility } from "@/lib/query/use-document-visibility"

export interface ApprovalRow {
  id: string
  status: ApprovalStatus
  amount: number
  currency: string
  requester_id: string
  created_at: string
  updated_at: string
  subject_type: "transfer" | "payout" | "invoice" | "card" | "payroll_run"
  subject_id: string
  memo: string | null
}

/**
 * Approval queue for the active scope.
 *
 * NOTE: there is NO realtime coverage for approvals — the shared bridge
 * deliberately does not subscribe (`realtime.ts`: the table is absent from
 * some schemas), and the gated polling below is disabled whenever the
 * channel reports healthy, so this effectively never revalidates on its own
 * (an earlier version of this comment claimed realtime narrow-invalidation
 * that does not exist). No call sites today; before using it live, land the
 * `approvals` table + subscription or ungate the poll.
 */
export function useApprovalsQueue(status: ApprovalStatus = "open") {
  const { scope } = useScope()
  const realtimeHealth = useRealtimeHealth()
  const tabVisible = useDocumentVisibility()
  return useQuery({
    queryKey: scope ? qk.approvals.queue(scope, status) : ["approvals", "disabled"],
    enabled: Boolean(scope),
    queryFn: () =>
      apiFetch<{ approvals: ApprovalRow[] }>("/api/business/approvals", {
        query: { status },
      }),
    staleTime: 20_000,
    gcTime: 10 * 60_000,
    refetchInterval: tabVisible ? pollingIntervalFor("operational", realtimeHealth) : false,
    refetchIntervalInBackground: false,
    meta: { safePersist: false, webPersist: "none", freshness: "operational" },
  })
}

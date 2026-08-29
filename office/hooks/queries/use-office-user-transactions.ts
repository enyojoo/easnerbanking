"use client"

import { useQuery } from "@tanstack/react-query"
import { officeFetch } from "@/lib/api-client"
import type { OfficeTransaction } from "@/lib/types/office-transaction"
import { officeKeys } from "@/lib/query/keys"
import { useOfficeRealtimeRefetchInterval } from "@/lib/query/attach-office-realtime-bridge"
import { officeOperationalQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

export async function fetchOfficeUserTransactions(userId: string): Promise<OfficeTransaction[]> {
  const r = await officeFetch(
    `/api/admin/office/transactions?userId=${encodeURIComponent(userId)}&limit=100`,
  )
  const body = (await r.json()) as { transactions?: OfficeTransaction[]; error?: string }
  if (!r.ok || body.error) throw new Error(body.error || r.statusText)
  return body.transactions ?? []
}

export function useOfficeUserTransactions(userId: string | null | undefined) {
  const { enabled: adminEnabled } = useOfficeAdminEnabled()
  const enabled = adminEnabled && Boolean(userId)
  const refetchInterval = useOfficeRealtimeRefetchInterval("operational")

  return useQuery({
    queryKey: officeKeys.userTransactions(userId ?? ""),
    enabled,
    ...officeOperationalQueryDefaults,
    refetchInterval,
    queryFn: () => fetchOfficeUserTransactions(String(userId)),
  })
}

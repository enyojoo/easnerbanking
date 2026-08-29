"use client"

import { useQuery } from "@tanstack/react-query"
import { officeFetch } from "@/lib/api-client"
import type { OfficeOverviewResponse } from "@/lib/types/office-overview"
import { officeKeys } from "@/lib/query/keys"
import { useOfficeRealtimeRefetchInterval } from "@/lib/query/attach-office-realtime-bridge"
import { officeAnalyticsQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

/** Pure fetcher shared by the hook and the boot-time primer. */
export async function fetchOfficeOverview(preset: string): Promise<OfficeOverviewResponse> {
  const r = await officeFetch(`/api/admin/office/overview?preset=${encodeURIComponent(preset)}`)
  const d = (await r.json()) as OfficeOverviewResponse & { error?: string }
  if (!r.ok || d.error) {
    throw new Error(typeof d.error === "string" ? d.error : r.statusText || "Overview request failed")
  }
  return d
}

/** Options consumed by both `useOfficeOverview` and `primeOfficeNav`. */
export function officeOverviewQueryOptions(preset = "7d") {
  return {
    queryKey: officeKeys.overview(preset),
    queryFn: () => fetchOfficeOverview(preset),
    ...officeAnalyticsQueryDefaults,
  }
}

export function useOfficeOverview(preset = "7d") {
  const { enabled } = useOfficeAdminEnabled()
  const refetchInterval = useOfficeRealtimeRefetchInterval("analytics")

  return useQuery({
    ...officeOverviewQueryOptions(preset),
    enabled,
    refetchInterval,
  })
}

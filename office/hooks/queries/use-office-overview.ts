"use client"

import { useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { pollingIntervalFor } from "@easner/shared"
import { officeFetch } from "@/lib/api-client"
import type { OfficeOverviewResponse } from "@/lib/types/office-overview"
import { officeKeys } from "@/lib/query/keys"
import { useDocumentVisibility } from "@/lib/query/use-document-visibility"
import { useOfficeRealtimeHealth } from "@/lib/query/attach-office-realtime-bridge"
import { officeAnalyticsQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

export function useOfficeOverview(preset = "7d") {
  const { enabled } = useOfficeAdminEnabled()
  const realtimeHealth = useOfficeRealtimeHealth()
  const tabVisible = useDocumentVisibility()

  const queryFn = useCallback(async (): Promise<OfficeOverviewResponse> => {
    const r = await officeFetch(`/api/admin/office/overview?preset=${encodeURIComponent(preset)}`)
    const d = (await r.json()) as OfficeOverviewResponse & { error?: string }
    if (!r.ok || d.error) {
      throw new Error(typeof d.error === "string" ? d.error : r.statusText || "Overview request failed")
    }
    return d
  }, [preset])

  return useQuery({
    queryKey: officeKeys.overview(preset),
    enabled,
    queryFn,
    ...officeAnalyticsQueryDefaults,
    refetchInterval: tabVisible ? pollingIntervalFor("analytics", realtimeHealth) : false,
  })
}

"use client"

import { useQuery } from "@tanstack/react-query"
import { pollingIntervalFor } from "@easner/shared"
import { officeFetch } from "@/lib/api-client"
import { officeKeys } from "@/lib/query/keys"
import type { OfficeEventInboxResponse } from "@/lib/types/office-overview"
import { useDocumentVisibility } from "@/lib/query/use-document-visibility"
import { useOfficeRealtimeHealth } from "@/lib/query/attach-office-realtime-bridge"
import { OFFICE_LIST_STALE_MS, OFFICE_OPERATIONAL_GC_MS } from "./constants"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

export function useOfficeEventInbox(providerFilter: string, statusFilter: string) {
  const { enabled } = useOfficeAdminEnabled()
  const realtimeHealth = useOfficeRealtimeHealth()
  const tabVisible = useDocumentVisibility()

  return useQuery({
    queryKey: officeKeys.eventInbox(providerFilter, statusFilter),
    enabled,
    staleTime: OFFICE_LIST_STALE_MS,
    gcTime: OFFICE_OPERATIONAL_GC_MS,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    refetchInterval: tabVisible ? pollingIntervalFor("operational", realtimeHealth) : false,
    meta: { freshness: "operational" as const },
    queryFn: async (): Promise<OfficeEventInboxResponse> => {
      const params = new URLSearchParams({ limit: "200" })
      if (providerFilter !== "all") params.set("provider", providerFilter)
      if (statusFilter !== "all") params.set("status", statusFilter)
      const r = await officeFetch(`/api/admin/office/event-inbox?${params.toString()}`)
      const body = (await r.json()) as OfficeEventInboxResponse & { error?: string }
      if (!r.ok || body.error) {
        throw new Error(typeof body.error === "string" ? body.error : r.statusText || "Failed to load webhook inbox")
      }
      return body
    },
  })
}

"use client"

import { useQuery } from "@tanstack/react-query"
import { payoutCorridorsApi, type PayoutCorridorAdminRow } from "@/lib/payout-corridors-api"
import { officeKeys } from "@/lib/query/keys"
import { OFFICE_REFERENCE_STALE_MS } from "./constants"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

export function useOfficePayoutCorridors() {
  const { enabled } = useOfficeAdminEnabled()

  return useQuery({
    queryKey: officeKeys.payoutCorridors(),
    enabled,
    staleTime: OFFICE_REFERENCE_STALE_MS,
    queryFn: (): Promise<PayoutCorridorAdminRow[]> => payoutCorridorsApi.list(),
  })
}

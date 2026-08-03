"use client"

import { useQuery } from "@tanstack/react-query"
import { payoutCorridorsApi, type PayoutCorridorAdminRow } from "@/lib/payout-corridors-api"
import { officeKeys } from "@/lib/query/keys"
import { officeReferenceQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

export function useOfficePayoutCorridors() {
  const { enabled } = useOfficeAdminEnabled()

  return useQuery({
    queryKey: officeKeys.payoutCorridors(),
    enabled,
    ...officeReferenceQueryDefaults,
    queryFn: (): Promise<PayoutCorridorAdminRow[]> =>
      payoutCorridorsApi.list({ annotateProviders: true }),
  })
}

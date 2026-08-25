"use client"

import { useQuery } from "@tanstack/react-query"
import { payoutCorridorsApi, type PayoutCorridorAdminRow } from "@/lib/payout-corridors-api"
import { officeKeys } from "@/lib/query/keys"
import { officeReferenceQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

/** Pure fetcher shared by the hook and the boot-time primer. */
export function fetchOfficePayoutCorridors(): Promise<PayoutCorridorAdminRow[]> {
  return payoutCorridorsApi.list({ annotateProviders: true })
}

/** Options consumed by both `useOfficePayoutCorridors` and `primeOfficeNav`. */
export function officePayoutCorridorsQueryOptions() {
  return {
    queryKey: officeKeys.payoutCorridors(),
    queryFn: fetchOfficePayoutCorridors,
    ...officeReferenceQueryDefaults,
  }
}

export function useOfficePayoutCorridors() {
  const { enabled } = useOfficeAdminEnabled()

  return useQuery({
    ...officePayoutCorridorsQueryOptions(),
    enabled,
  })
}

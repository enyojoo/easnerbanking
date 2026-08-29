"use client"

import { useQuery } from "@tanstack/react-query"
import { gridRatesApi, type GridRateAdminRow } from "@/lib/grid-rates-api"
import { officeKeys } from "@/lib/query/keys"
import { useOfficeRealtimeRefetchInterval } from "@/lib/query/attach-office-realtime-bridge"
import { officeRatesQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

/** Pure fetcher shared by the hook and the boot-time primer. */
export function fetchOfficeGridRates(): Promise<GridRateAdminRow[]> {
  return gridRatesApi.list()
}

/** Options consumed by both `useOfficeGridRates` and `primeOfficeNav`. */
export function officeGridRatesQueryOptions() {
  return {
    queryKey: officeKeys.gridRates(),
    queryFn: fetchOfficeGridRates,
    ...officeRatesQueryDefaults,
  }
}

export function useOfficeGridRates() {
  const { enabled } = useOfficeAdminEnabled()
  const refetchInterval = useOfficeRealtimeRefetchInterval("reference")

  return useQuery({
    ...officeGridRatesQueryOptions(),
    enabled,
    refetchInterval,
  })
}

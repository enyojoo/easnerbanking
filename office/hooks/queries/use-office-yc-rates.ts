"use client"

import { useQuery } from "@tanstack/react-query"
import { ycRatesApi, type YcRateAdminRow } from "@/lib/yc-rates-api"
import { officeKeys } from "@/lib/query/keys"
import { officeRatesQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

/** Pure fetcher shared by the hook and the boot-time primer. */
export function fetchOfficeYcRates(): Promise<YcRateAdminRow[]> {
  return ycRatesApi.list()
}

/** Options consumed by both `useOfficeYcRates` and `primeOfficeNav`. */
export function officeYcRatesQueryOptions() {
  return {
    queryKey: officeKeys.ycRates(),
    queryFn: fetchOfficeYcRates,
    ...officeRatesQueryDefaults,
  }
}

export function useOfficeYcRates() {
  const { enabled } = useOfficeAdminEnabled()

  return useQuery({
    ...officeYcRatesQueryOptions(),
    enabled,
  })
}

"use client"

import { useQuery } from "@tanstack/react-query"
import { noahRatesApi, type NoahRateAdminRow } from "@/lib/noah-rates-api"
import { officeKeys } from "@/lib/query/keys"
import { officeRatesQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

/** Pure fetcher shared by the hook and the boot-time primer. */
export function fetchOfficeNoahRates(): Promise<NoahRateAdminRow[]> {
  return noahRatesApi.list()
}

/** Options consumed by both `useOfficeNoahRates` and `primeOfficeNav`. */
export function officeNoahRatesQueryOptions() {
  return {
    queryKey: officeKeys.noahRates(),
    queryFn: fetchOfficeNoahRates,
    ...officeRatesQueryDefaults,
  }
}

export function useOfficeNoahRates() {
  const { enabled } = useOfficeAdminEnabled()

  return useQuery({
    ...officeNoahRatesQueryOptions(),
    enabled,
  })
}

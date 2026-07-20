"use client"

import { useQuery } from "@tanstack/react-query"
import { noahRatesApi, type NoahRateAdminRow } from "@/lib/noah-rates-api"
import { officeKeys } from "@/lib/query/keys"
import { officeRatesQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

export function useOfficeNoahRates() {
  const { enabled } = useOfficeAdminEnabled()

  return useQuery({
    queryKey: officeKeys.noahRates(),
    enabled,
    ...officeRatesQueryDefaults,
    queryFn: (): Promise<NoahRateAdminRow[]> => noahRatesApi.list(),
  })
}

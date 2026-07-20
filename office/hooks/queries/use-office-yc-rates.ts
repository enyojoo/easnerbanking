"use client"

import { useQuery } from "@tanstack/react-query"
import { ycRatesApi, type YcRateAdminRow } from "@/lib/yc-rates-api"
import { officeKeys } from "@/lib/query/keys"
import { officeRatesQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

export function useOfficeYcRates() {
  const { enabled } = useOfficeAdminEnabled()

  return useQuery({
    queryKey: officeKeys.ycRates(),
    enabled,
    ...officeRatesQueryDefaults,
    queryFn: (): Promise<YcRateAdminRow[]> => ycRatesApi.list(),
  })
}

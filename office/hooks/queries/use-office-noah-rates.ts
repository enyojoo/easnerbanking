"use client"

import { useQuery } from "@tanstack/react-query"
import { noahRatesApi, type NoahRateAdminRow } from "@/lib/noah-rates-api"
import { officeKeys } from "@/lib/query/keys"
import { OFFICE_REFERENCE_STALE_MS } from "./constants"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

export function useOfficeNoahRates() {
  const { enabled } = useOfficeAdminEnabled()

  return useQuery({
    queryKey: officeKeys.noahRates(),
    enabled,
    staleTime: OFFICE_REFERENCE_STALE_MS,
    queryFn: (): Promise<NoahRateAdminRow[]> => noahRatesApi.list(),
  })
}

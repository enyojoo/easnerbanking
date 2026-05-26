"use client"

import { useQuery } from "@tanstack/react-query"
import { exchangeRatesApi, type ExchangeRateAdminRow } from "@/lib/exchange-rates-api"
import { officeKeys } from "@/lib/query/keys"
import { OFFICE_REFERENCE_STALE_MS } from "./constants"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

export function useOfficeExchangeRates() {
  const { enabled } = useOfficeAdminEnabled()

  return useQuery({
    queryKey: officeKeys.exchangeRates(),
    enabled,
    staleTime: OFFICE_REFERENCE_STALE_MS,
    queryFn: (): Promise<ExchangeRateAdminRow[]> => exchangeRatesApi.list(),
  })
}

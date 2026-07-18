"use client"

import { useQuery } from "@tanstack/react-query"
import { cryptoRatesApi, type CryptoRateAdminRow } from "@/lib/crypto-rates-api"
import { officeKeys } from "@/lib/query/keys"
import { officeReferenceQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

export function useOfficeCryptoRates() {
  const { enabled } = useOfficeAdminEnabled()

  return useQuery({
    queryKey: officeKeys.cryptoRates(),
    enabled,
    ...officeReferenceQueryDefaults,
    queryFn: (): Promise<CryptoRateAdminRow[]> => cryptoRatesApi.list(),
  })
}

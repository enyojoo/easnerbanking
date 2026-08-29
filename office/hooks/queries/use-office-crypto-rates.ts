"use client"

import { useQuery } from "@tanstack/react-query"
import { cryptoRatesApi, type CryptoRateAdminRow } from "@/lib/crypto-rates-api"
import { officeKeys } from "@/lib/query/keys"
import { useOfficeRealtimeRefetchInterval } from "@/lib/query/attach-office-realtime-bridge"
import { officeRatesQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

/** Pure fetcher shared by the hook and the boot-time primer. */
export function fetchOfficeCryptoRates(): Promise<CryptoRateAdminRow[]> {
  return cryptoRatesApi.list()
}

/** Options consumed by both `useOfficeCryptoRates` and `primeOfficeNav`. */
export function officeCryptoRatesQueryOptions() {
  return {
    queryKey: officeKeys.cryptoRates(),
    queryFn: fetchOfficeCryptoRates,
    ...officeRatesQueryDefaults,
  }
}

export function useOfficeCryptoRates() {
  const { enabled } = useOfficeAdminEnabled()
  const refetchInterval = useOfficeRealtimeRefetchInterval("reference")

  return useQuery({
    ...officeCryptoRatesQueryOptions(),
    enabled,
    refetchInterval,
  })
}

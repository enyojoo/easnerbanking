"use client"

import { useQuery } from "@tanstack/react-query"
import { cryptoDestinationsApi, type CryptoDestinationAdminRow } from "@/lib/crypto-destinations-api"
import { officeKeys } from "@/lib/query/keys"
import { useOfficeRealtimeRefetchInterval } from "@/lib/query/attach-office-realtime-bridge"
import { officeReferenceQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

/** Pure fetcher shared by the hook and the boot-time primer. */
export function fetchOfficeCryptoDestinations(): Promise<CryptoDestinationAdminRow[]> {
  return cryptoDestinationsApi.list()
}

/** Options consumed by both `useOfficeCryptoDestinations` and `primeOfficeNav`. */
export function officeCryptoDestinationsQueryOptions() {
  return {
    queryKey: officeKeys.cryptoDestinations(),
    queryFn: fetchOfficeCryptoDestinations,
    ...officeReferenceQueryDefaults,
  }
}

export function useOfficeCryptoDestinations() {
  const { enabled } = useOfficeAdminEnabled()
  const refetchInterval = useOfficeRealtimeRefetchInterval("reference")

  return useQuery({
    ...officeCryptoDestinationsQueryOptions(),
    enabled,
    refetchInterval,
  })
}

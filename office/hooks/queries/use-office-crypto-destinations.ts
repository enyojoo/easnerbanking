"use client"

import { useQuery } from "@tanstack/react-query"
import { cryptoDestinationsApi, type CryptoDestinationAdminRow } from "@/lib/crypto-destinations-api"
import { officeKeys } from "@/lib/query/keys"
import { officeReferenceQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

export function useOfficeCryptoDestinations() {
  const { enabled } = useOfficeAdminEnabled()

  return useQuery({
    queryKey: officeKeys.cryptoDestinations(),
    enabled,
    ...officeReferenceQueryDefaults,
    queryFn: (): Promise<CryptoDestinationAdminRow[]> => cryptoDestinationsApi.list(),
  })
}

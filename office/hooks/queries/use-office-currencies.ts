"use client"

import { useQuery } from "@tanstack/react-query"
import { currenciesApi, type CurrencyAdminRow } from "@/lib/currencies-api"
import { officeKeys, type OfficeCurrencyScope } from "@/lib/query/keys"
import { officeReferenceQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

/** Pure fetcher shared by the hook and the boot-time primer. */
export function fetchOfficeCurrencies(scope?: OfficeCurrencyScope): Promise<CurrencyAdminRow[]> {
  return currenciesApi.list(scope ? { scope } : undefined)
}

/** Options consumed by both `useOfficeCurrencies` and `primeOfficeNav`. */
export function officeCurrenciesQueryOptions(scope?: OfficeCurrencyScope) {
  return {
    queryKey: officeKeys.currencies(scope ?? "all"),
    queryFn: () => fetchOfficeCurrencies(scope),
    ...officeReferenceQueryDefaults,
  }
}

export function useOfficeCurrencies(scope?: OfficeCurrencyScope) {
  const { enabled } = useOfficeAdminEnabled()

  return useQuery({
    ...officeCurrenciesQueryOptions(scope),
    enabled,
  })
}

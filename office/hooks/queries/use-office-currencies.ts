"use client"

import { useQuery } from "@tanstack/react-query"
import { currenciesApi, type CurrencyAdminRow } from "@/lib/currencies-api"
import { officeKeys, type OfficeCurrencyScope } from "@/lib/query/keys"
import { officeReferenceQueryDefaults } from "./query-options"
import { useOfficeAdminEnabled } from "./use-office-admin-enabled"

export function useOfficeCurrencies(scope?: OfficeCurrencyScope) {
  const { enabled } = useOfficeAdminEnabled()
  const keyScope = scope ?? "all"

  return useQuery({
    queryKey: officeKeys.currencies(keyScope),
    enabled,
    ...officeReferenceQueryDefaults,
    queryFn: (): Promise<CurrencyAdminRow[]> =>
      currenciesApi.list(scope ? { scope } : undefined),
  })
}

import { useQuery } from "@tanstack/react-query"
import { gridRatesApi, type GridRateAdminRow } from "@/lib/grid-rates-api"
import { officeKeys } from "@/lib/query/keys"

/** Pure fetcher shared by the hook and the boot-time primer. */
export function fetchOfficeGridRates(): Promise<GridRateAdminRow[]> {
  return gridRatesApi.list()
}

/** Options consumed by both `useOfficeGridRates` and `primeOfficeNav`. */
export function officeGridRatesQueryOptions() {
  return {
    queryKey: officeKeys.gridRates(),
    queryFn: fetchOfficeGridRates,
    staleTime: 60_000,
  }
}

export function useOfficeGridRates() {
  return useQuery<GridRateAdminRow[]>(officeGridRatesQueryOptions())
}

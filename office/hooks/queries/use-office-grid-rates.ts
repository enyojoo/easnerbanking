import { useQuery } from "@tanstack/react-query"
import { gridRatesApi, type GridRateAdminRow } from "@/lib/grid-rates-api"
import { officeKeys } from "@/lib/query/keys"

export function useOfficeGridRates() {
  return useQuery<GridRateAdminRow[]>({
    queryKey: officeKeys.gridRates(),
    queryFn: () => gridRatesApi.list(),
    staleTime: 60_000,
  })
}

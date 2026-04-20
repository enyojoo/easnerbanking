import { useQuery } from '@tanstack/react-query'
import { qk } from '@easner/shared'
import { NOAH_CONTEXT_CURRENCIES } from '../../lib/noahStaticData'
import type { Currency } from '../../types'

/**
 * Reference currency catalog used throughout mobile forms.
 */
export function useCurrenciesCatalog() {
  return useQuery({
    queryKey: qk.reference.currencies(),
    queryFn: async () => [...NOAH_CONTEXT_CURRENCIES] as Currency[],
    staleTime: 24 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    meta: { safePersist: true, freshness: 'reference' },
  })
}

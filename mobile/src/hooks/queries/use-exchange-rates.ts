import { useQuery } from '@tanstack/react-query'
import { buildExchangeRatesFromNoahQuotes } from '../../lib/noahUserDataHelpers'
import { noahService } from '../../lib/noahService'
import type { ExchangeRate } from '../../types'

/**
 * Operational FX reference used by send/profile statistics paths.
 * Pass `enabled: false` on screens that never need cross-currency Noah quotes (e.g. same-currency Easetag P2P).
 */
export function useExchangeRatesList(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['exchange-rates', 'mobile'],
    queryFn: async () =>
      buildExchangeRatesFromNoahQuotes((p) => noahService.getFxQuote(p)) as Promise<ExchangeRate[]>,
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: true, freshness: 'reference' },
    enabled: opts?.enabled !== false,
  })
}

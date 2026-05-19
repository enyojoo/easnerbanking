import { useQuery } from '@tanstack/react-query'
import { buildExchangeRatesFromNoahQuotes } from '../../lib/noahUserDataHelpers'
import { noahService } from '../../lib/noahService'
import type { ExchangeRate } from '../../types'

/**
 * Legacy full-catalog Noah rates (no `destinations` filter).
 * Send flow should use `useNoahSendExchangeRates` (recipient-scoped, matches business /send).
 */
export function useExchangeRatesList(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['exchange-rates', 'mobile'],
    queryFn: async () =>
      buildExchangeRatesFromNoahQuotes(
        (p) => noahService.getFxQuote(p),
        () => noahService.getNoahExchangeRates(),
      ) as Promise<ExchangeRate[]>,
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: true, freshness: 'reference' },
    enabled: opts?.enabled !== false,
  })
}

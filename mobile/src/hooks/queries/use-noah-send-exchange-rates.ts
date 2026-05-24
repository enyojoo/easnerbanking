import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query'
import { mapNoahWalletRateRows } from '@easner/shared'
import { noahService } from '../../lib/noahService'
import type { ExchangeRate } from '../../types'

const STALE_MS = 2 * 60_000
const GC_MS = 10 * 60_000

function noahSendRatesQueryKey(receiveCurrency: string) {
  return ['exchange-rates', 'noah-send', receiveCurrency] as const
}

async function fetchNoahSendExchangeRates(receiveCurrency: string): Promise<ExchangeRate[]> {
  const dest = receiveCurrency.trim().toUpperCase()
  const rows = await noahService.getNoahExchangeRates({ destinations: dest })
  return mapNoahWalletRateRows(rows) as ExchangeRate[]
}

/** Prefetch Noah wallet rates before navigating to SendAmount (avoids stale reference fallback). */
export function prefetchNoahSendExchangeRates(
  qc: QueryClient,
  receiveCurrency: string | undefined,
) {
  const dest = (receiveCurrency || '').trim().toUpperCase()
  if (dest.length !== 3) return Promise.resolve()
  return qc.prefetchQuery({
    queryKey: noahSendRatesQueryKey(dest),
    queryFn: () => fetchNoahSendExchangeRates(dest),
    staleTime: STALE_MS,
    gcTime: GC_MS,
  })
}

/**
 * Recipient-scoped Noah wallet rates (same as business /send).
 * Pass `enabled: false` for same-currency Easetag P2P.
 */
export function useNoahSendExchangeRates(
  receiveCurrency: string | undefined,
  opts?: { enabled?: boolean },
) {
  const dest = (receiveCurrency || '').trim().toUpperCase()
  const enabled =
    opts?.enabled !== false && dest.length === 3

  return useQuery({
    queryKey: noahSendRatesQueryKey(dest),
    queryFn: () => fetchNoahSendExchangeRates(dest),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    enabled,
    // Show the previously-loaded currency's rates while the new one fetches so the
    // SendAmount screen never flashes a "no rate" state when switching recipients.
    // The hook also re-derives the rate by code, so consumers naturally ignore stale pairs.
    placeholderData: keepPreviousData,
  })
}

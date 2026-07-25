import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query'
import { mapGridBalancePayoutRateRows } from '@easner/shared'
import { getApiBaseUrl } from '../../lib/apiClient'
import { supabase } from '../../lib/supabase'
import type { ExchangeRate } from '../../types'

const STALE_MS = 2 * 60_000
const GC_MS = 10 * 60_000
const GRID_SEND_RATES_META = { safePersist: true, freshness: 'reference' as const }

function gridSendRatesQueryKey(receiveCurrency: string) {
  return ['exchange-rates', 'grid-send', receiveCurrency] as const
}

async function fetchGridSendExchangeRates(receiveCurrency: string): Promise<ExchangeRate[]> {
  const dest = receiveCurrency.trim().toUpperCase()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')
  const path =
    dest.length === 3
      ? `/api/fx/grid-rates?destinations=${encodeURIComponent(dest)}`
      : '/api/fx/grid-rates'
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  const data = (await res.json().catch(() => ({}))) as {
    rates?: Array<{ from_currency: string; to_currency: string; rate: number; as_of?: string }>
    error?: string
  }
  if (!res.ok) throw new Error(data.error || 'Failed to load Grid exchange rates')
  return mapGridBalancePayoutRateRows(data.rates ?? []) as ExchangeRate[]
}

export function prefetchGridSendExchangeRates(
  qc: QueryClient,
  receiveCurrency: string | undefined,
) {
  const dest = (receiveCurrency || '').trim().toUpperCase()
  if (dest.length !== 3) return Promise.resolve()
  return qc.prefetchQuery({
    queryKey: gridSendRatesQueryKey(dest),
    queryFn: () => fetchGridSendExchangeRates(dest),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    meta: GRID_SEND_RATES_META,
  })
}

export function useGridSendExchangeRates(
  receiveCurrency: string | undefined,
  opts?: { enabled?: boolean },
) {
  const dest = (receiveCurrency || '').trim().toUpperCase()
  const enabled = opts?.enabled !== false && dest.length === 3

  return useQuery({
    queryKey: gridSendRatesQueryKey(dest),
    queryFn: () => fetchGridSendExchangeRates(dest),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    enabled,
    placeholderData: keepPreviousData,
    meta: GRID_SEND_RATES_META,
  })
}

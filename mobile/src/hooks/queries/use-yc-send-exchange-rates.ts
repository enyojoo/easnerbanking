import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query'
import { mapNoahWalletRateRows } from '@easner/shared'
import { getApiBaseUrl } from '../../lib/apiClient'
import { supabase } from '../../lib/supabase'
import type { ExchangeRate } from '../../types'

const STALE_MS = 2 * 60_000
const GC_MS = 10 * 60_000
const YC_SEND_RATES_META = { safePersist: true, freshness: 'reference' as const }

function ycSendRatesQueryKey(receiveCurrency: string) {
  return ['exchange-rates', 'yc-send', receiveCurrency] as const
}

async function fetchYcSendExchangeRates(receiveCurrency: string): Promise<ExchangeRate[]> {
  const dest = receiveCurrency.trim().toUpperCase()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')
  const path =
    dest.length === 3
      ? `/api/fx/yc-rates?destinations=${encodeURIComponent(dest)}`
      : '/api/fx/yc-rates'
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  const data = (await res.json().catch(() => ({}))) as {
    rates?: Array<{ from_currency: string; to_currency: string; rate: number; as_of?: string }>
    error?: string
  }
  if (!res.ok) throw new Error(data.error || 'Failed to load YC exchange rates')
  return mapNoahWalletRateRows(data.rates ?? []) as ExchangeRate[]
}

export function prefetchYcSendExchangeRates(
  qc: QueryClient,
  receiveCurrency: string | undefined,
) {
  const dest = (receiveCurrency || '').trim().toUpperCase()
  if (dest.length !== 3) return Promise.resolve()
  return qc.prefetchQuery({
    queryKey: ycSendRatesQueryKey(dest),
    queryFn: () => fetchYcSendExchangeRates(dest),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    meta: YC_SEND_RATES_META,
  })
}

export function useYcSendExchangeRates(
  receiveCurrency: string | undefined,
  opts?: { enabled?: boolean },
) {
  const dest = (receiveCurrency || '').trim().toUpperCase()
  const enabled = opts?.enabled !== false && dest.length === 3

  return useQuery({
    queryKey: ycSendRatesQueryKey(dest),
    queryFn: () => fetchYcSendExchangeRates(dest),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    enabled,
    placeholderData: keepPreviousData,
    meta: YC_SEND_RATES_META,
  })
}

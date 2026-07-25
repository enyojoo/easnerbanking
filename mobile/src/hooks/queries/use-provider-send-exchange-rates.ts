import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query'
import {
  mapProviderBalancePayoutRateRows,
  providerSendRatesQueryPath,
  type PayoutProviderId,
} from '@easner/shared'
import { getApiBaseUrl } from '../../lib/apiClient'
import { supabase } from '../../lib/supabase'
import type { ExchangeRate } from '../../types'

const STALE_MS = 2 * 60_000
const GC_MS = 10 * 60_000
const PROVIDER_SEND_RATES_META = { safePersist: true, freshness: 'reference' as const }

function providerSendRatesQueryKey(provider: PayoutProviderId, receiveCurrency: string) {
  return ['exchange-rates', 'provider-send', provider, receiveCurrency] as const
}

async function fetchProviderSendExchangeRates(
  provider: PayoutProviderId,
  receiveCurrency: string,
): Promise<ExchangeRate[]> {
  const dest = receiveCurrency.trim().toUpperCase()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')

  const path = providerSendRatesQueryPath(provider, dest)
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  const data = (await res.json().catch(() => ({}))) as {
    rates?: Array<{ from_currency: string; to_currency: string; rate: number; as_of?: string }>
    error?: string
  }
  if (!res.ok) throw new Error(data.error || `Failed to load ${provider} exchange rates`)
  return mapProviderBalancePayoutRateRows(provider, data.rates ?? []) as ExchangeRate[]
}

export function prefetchProviderSendExchangeRates(
  qc: QueryClient,
  receiveCurrency: string | undefined,
  provider: PayoutProviderId,
) {
  const dest = (receiveCurrency || '').trim().toUpperCase()
  if (dest.length !== 3) return Promise.resolve()
  return qc.prefetchQuery({
    queryKey: providerSendRatesQueryKey(provider, dest),
    queryFn: () => fetchProviderSendExchangeRates(provider, dest),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    meta: PROVIDER_SEND_RATES_META,
  })
}

export function useProviderSendExchangeRates(
  receiveCurrency: string | undefined,
  provider: PayoutProviderId | null | undefined,
  opts?: { enabled?: boolean },
) {
  const dest = (receiveCurrency || '').trim().toUpperCase()
  const enabled =
    opts?.enabled !== false && dest.length === 3 && provider != null

  return useQuery({
    queryKey: providerSendRatesQueryKey(provider ?? 'noah', dest),
    queryFn: () => fetchProviderSendExchangeRates(provider!, dest),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    enabled,
    placeholderData: keepPreviousData,
    meta: PROVIDER_SEND_RATES_META,
  })
}

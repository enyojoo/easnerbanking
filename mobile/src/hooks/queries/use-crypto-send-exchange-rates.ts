import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query'
import { noahService } from '../../lib/noahService'

const STALE_MS = 2 * 60_000
const GC_MS = 10 * 60_000

/** Last successful `/api/fx/crypto-rates` payload (= `crypto_rates` rows). Shown instantly on cold start; refetch refreshes from DB. */
const CRYPTO_SEND_RATES_META = { safePersist: true, freshness: 'reference' as const }

export type CryptoSendRateRow = {
  from_currency: string
  to_currency: string
  receive_network: string
  rate: number
  bridge_mid: number
  as_of: string
}

function cryptoSendRatesQueryKey(receiveAsset: string, network: string) {
  return ['exchange-rates', 'crypto-send', receiveAsset, network] as const
}

async function fetchCryptoSendExchangeRates(
  receiveAsset: string,
  network: string,
): Promise<CryptoSendRateRow[]> {
  const asset = receiveAsset.trim().toUpperCase()
  const net = network.trim()
  const data = await noahService.getCryptoExchangeRates({
    destinations: asset,
    networks: net,
  })
  return data.rates.filter(
    (r) => r.to_currency === asset && r.receive_network === net,
  )
}

export function prefetchCryptoSendExchangeRates(
  qc: QueryClient,
  receiveAsset: string | undefined,
  network: string | undefined,
) {
  const asset = (receiveAsset || '').trim().toUpperCase()
  const net = (network || '').trim()
  if (!asset || !net) return Promise.resolve()
  return qc.prefetchQuery({
    queryKey: cryptoSendRatesQueryKey(asset, net),
    queryFn: () => fetchCryptoSendExchangeRates(asset, net),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    meta: CRYPTO_SEND_RATES_META,
  })
}

export function useCryptoSendExchangeRates(
  receiveAsset: string | undefined,
  network: string | undefined,
  opts?: { enabled?: boolean },
) {
  const asset = (receiveAsset || '').trim().toUpperCase()
  const net = (network || '').trim()
  const enabled = opts?.enabled !== false && Boolean(asset && net)

  return useQuery({
    queryKey: cryptoSendRatesQueryKey(asset, net),
    queryFn: () => fetchCryptoSendExchangeRates(asset, net),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    enabled,
    placeholderData: keepPreviousData,
    meta: CRYPTO_SEND_RATES_META,
  })
}

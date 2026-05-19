import { useQuery } from '@tanstack/react-query'
import { mapNoahWalletRateRows } from '@easner/shared'
import { noahService } from '../../lib/noahService'
import type { ExchangeRate } from '../../types'

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
    queryKey: ['exchange-rates', 'noah-send', dest],
    queryFn: async () => {
      const rows = await noahService.getNoahExchangeRates({ destinations: dest })
      return mapNoahWalletRateRows(rows) as ExchangeRate[]
    },
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
    enabled,
  })
}

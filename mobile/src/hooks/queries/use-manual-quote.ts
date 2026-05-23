import { useQuery } from '@tanstack/react-query'
import { fetchManualQuote } from '../../lib/manual-send-api'

export function useManualQuote(input: {
  enabled: boolean
  direction: 'send' | 'receive'
  amount: number
  fromCurrency: string
  toCurrency: string
}) {
  const { enabled, direction, amount, fromCurrency, toCurrency } = input
  return useQuery({
    queryKey: ['manual-send', 'quote', direction, amount, fromCurrency, toCurrency],
    queryFn: () =>
      fetchManualQuote({
        direction,
        amount,
        fromCurrency,
        toCurrency,
      }),
    enabled: enabled && amount > 0 && !!fromCurrency && !!toCurrency,
    staleTime: 30_000,
  })
}

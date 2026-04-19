import { useQuery } from '@tanstack/react-query'
import { qk } from '@easner/shared'
import { apiFetch } from '../../query/api-client'

/**
 * FX reference data + per-pair quote.
 *
 * FX pairs are reference data, cached aggressively (30 min stale).
 * Quotes are short-lived; callers should re-call `useFxQuote` on input
 * changes and respect `expiresAt` when submitting a transfer.
 */

export interface FxPair {
  from: string
  to: string
  rate: number
  bidirectional?: boolean
}

export function useFxPairs() {
  return useQuery({
    queryKey: qk.fx.pairs(),
    queryFn: () => apiFetch<{ pairs: FxPair[] }>('/api/fx/pairs'),
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    meta: { safePersist: true, freshness: 'reference' },
  })
}

export function useFxQuote(params: {
  from: string | null
  to: string | null
  amount: string
}) {
  const { from, to, amount } = params
  const ready = Boolean(from && to && Number(amount) > 0)
  return useQuery({
    queryKey:
      from && to ? qk.fx.quote(from, to, amount) : ['fx', 'quote', 'disabled'],
    enabled: ready,
    queryFn: () =>
      apiFetch<unknown>('/api/fx/quote', {
        query: { from: from ?? undefined, to: to ?? undefined, amount },
      }),
    staleTime: 5_000,
    gcTime: 60_000,
    meta: { safePersist: false, freshness: 'critical' },
  })
}

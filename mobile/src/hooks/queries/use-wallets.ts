import { useQuery } from '@tanstack/react-query'
import { qk } from '@easner/shared'
import { apiFetch } from '../../query/api-client'
import { useScope } from '../../query/scope'
import { NOAH_SCOPE_INDIVIDUAL_HEADERS } from '../../lib/apiClient'

/**
 * Mobile wallet balances for the authenticated Personal scope.
 *
 * Mirrors the business `useWalletBalances` hook but talks to the individual
 * Noah scope and returns the compact `{ USD, EUR }` envelope that existing
 * mobile screens consume. Never optimistic — balances are server-authoritative
 * and the realtime bridge invalidates `qk.wallets.list` on balance events
 * when a definitive value lands.
 */

export interface WalletBalancesEnvelope {
  USD?: string
  EUR?: string
  source?: 'turnkey' | 'none'
  detail?: string
  balanceCaip2?: string
  /** Internal flags so context can distinguish "missing field" vs explicit zero. */
  _hasUSD?: boolean
  _hasEUR?: boolean
}

export function useWalletBalances() {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? qk.wallets.list(scope) : ['wallets', 'disabled'],
    enabled: Boolean(scope),
    queryFn: async () => {
      const body = await apiFetch<Partial<WalletBalancesEnvelope>>(
        '/api/wallets/on-chain-balances',
        { headers: { ...NOAH_SCOPE_INDIVIDUAL_HEADERS } },
      )
      const hasUSD = Object.prototype.hasOwnProperty.call(body ?? {}, 'USD')
      const hasEUR = Object.prototype.hasOwnProperty.call(body ?? {}, 'EUR')
      return {
        USD: hasUSD ? String(body?.USD ?? '0') : undefined,
        EUR: hasEUR ? String(body?.EUR ?? '0') : undefined,
        source: body?.source,
        detail: body?.detail,
        balanceCaip2: body?.balanceCaip2,
        _hasUSD: hasUSD,
        _hasEUR: hasEUR,
      } satisfies WalletBalancesEnvelope
    },
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    // Fallback polling when realtime is unhealthy. The realtime bridge
    // pokes `qk.wallets.list` on balance events so this rarely actually
    // fires when the channel is happy.
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    // Balances are sensitive — NEVER persist to disk.
    meta: { safePersist: false, freshness: 'critical' },
  })
}

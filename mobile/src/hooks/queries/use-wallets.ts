import { useQuery } from '@tanstack/react-query'
import { pollingIntervalFor, qk } from '@easner/shared'
import { apiFetch } from '../../query/api-client'
import { useScope } from '../../query/scope'
import { NOAH_SCOPE_INDIVIDUAL_HEADERS } from '../../lib/apiClient'
import { useRealtimeHealth } from '../../query/realtime-health-context'

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
  USD: string
  EUR: string
  source?: 'turnkey' | 'none'
  detail?: string
  balanceCaip2?: string
}

export function useWalletBalances() {
  const { scope } = useScope()
  const realtimeHealth = useRealtimeHealth()
  return useQuery({
    queryKey: scope ? qk.wallets.list(scope) : ['wallets', 'disabled'],
    enabled: Boolean(scope),
    queryFn: async () => {
      const body = await apiFetch<Partial<WalletBalancesEnvelope>>(
        '/api/wallets/on-chain-balances',
        { headers: { ...NOAH_SCOPE_INDIVIDUAL_HEADERS } },
      )
      return {
        USD: String(body?.USD ?? '0'),
        EUR: String(body?.EUR ?? '0'),
        source: body?.source,
        detail: body?.detail,
        balanceCaip2: body?.balanceCaip2,
      } satisfies WalletBalancesEnvelope
    },
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    // Fallback polling when realtime is unhealthy. The realtime bridge
    // pokes `qk.wallets.list` on balance events so this rarely actually
    // fires when the channel is happy.
    refetchInterval: pollingIntervalFor('critical', realtimeHealth),
    refetchIntervalInBackground: false,
    // Balances are sensitive — NEVER persist to disk.
    meta: { safePersist: false, freshness: 'critical' },
  })
}

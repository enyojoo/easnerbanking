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
      const source = body?.source
      const detail = String(body?.detail ?? '')
      const isTransientTurnkeyFailure =
        source === 'none' &&
        (detail === 'turnkey_balance_query_failed' || detail.startsWith('turnkey_balance_query_failed:'))
      if (isTransientTurnkeyFailure) {
        // Keep last known good balance in cache on temporary provider/read failures
        // instead of flashing "0.00" on dashboard during background refetches.
        throw new Error('Transient Turnkey balance lookup failure')
      }
      return {
        USD: String(body?.USD ?? '0'),
        EUR: String(body?.EUR ?? '0'),
        source,
        detail: body?.detail,
        balanceCaip2: body?.balanceCaip2,
      } satisfies WalletBalancesEnvelope
    },
    staleTime: 60_000,
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

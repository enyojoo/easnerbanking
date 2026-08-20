import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppState, Platform, type AppStateStatus } from 'react-native'
import { useEffect, useRef, useState } from 'react'
import { useDocumentVisibility } from '../useDocumentVisibility'
import { markRecentMoneyActivity, pollingIntervalFor, qk } from '@easner/shared'
import { apiFetch } from '../../query/api-client'
import { useScope } from '../../query/scope'
import { ACCOUNT_SCOPE_INDIVIDUAL_HEADERS } from '../../lib/apiClient'
import { useRealtimeHealth } from '../../query/realtime-health-context'
import { isSuspiciousAuthoritativeZeroRegression } from '../../lib/wallet-balance-display'

/**
 * Mobile wallet balances for the authenticated Personal scope.
 *
 * Mirrors the business `useWalletBalances` hook but talks to the individual
 * Noah scope and returns the compact `{ USD, EUR }` envelope that existing
 * mobile screens consume. Never optimistic – balances are server-authoritative
 * and the realtime bridge invalidates `qk.wallets.list` on balance events
 * when a definitive value lands.
 */

export interface WalletBalancesEnvelope {
  USD: string
  EUR: string
  source?: 'turnkey' | 'db' | 'realtime' | 'none'
  detail?: string
  balanceCaip2?: string
}

export function useWalletBalances() {
  const { scope } = useScope()
  const qc = useQueryClient()
  const realtimeHealth = useRealtimeHealth()
  const tabVisible = useDocumentVisibility()
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState)
  useEffect(() => {
    if (Platform.OS === 'web') return
    const sub = AppState.addEventListener('change', setAppState)
    return () => sub.remove()
  }, [])
  const inForeground = Platform.OS === 'web' ? tabVisible : appState === 'active'
  const queryKey = scope ? qk.wallets.list(scope) : (['wallets', 'disabled'] as const)
  const balanceSigRef = useRef<string | null>(null)

  const query = useQuery({
    queryKey,
    enabled: Boolean(scope),
    queryFn: async () => {
      const body = await apiFetch<Partial<WalletBalancesEnvelope>>(
        '/api/wallets/on-chain-balances',
        { headers: { ...ACCOUNT_SCOPE_INDIVIDUAL_HEADERS } },
      )
      const source = body?.source
      const detail = String(body?.detail ?? '')
      const isTransientTurnkeyFailure =
        source === 'none' &&
        (detail === 'turnkey_balance_query_failed' || detail.startsWith('turnkey_balance_query_failed:'))
      if (isTransientTurnkeyFailure) {
        // Keep last known good balance in cache on temporary provider/read failures.
        const prev = qc.getQueryData<WalletBalancesEnvelope>(queryKey as unknown as any)
        if (prev) return prev
        throw new Error('Transient Turnkey balance lookup failure')
      }
      const prev = qc.getQueryData<WalletBalancesEnvelope>(queryKey as unknown as any)
      if (
        isSuspiciousAuthoritativeZeroRegression(source, body?.USD, body?.EUR, prev ?? undefined)
      ) {
        if (prev) return prev
        throw new Error('Suspicious authoritative zero balance regression')
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
    refetchInterval: inForeground ? pollingIntervalFor('critical', realtimeHealth) : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    // Balances are sensitive – NEVER persist to disk.
    meta: { safePersist: false, freshness: 'critical' },
  })

  // When balance changes from API/polling (not only Supabase realtime), refresh ledger too.
  useEffect(() => {
    if (!scope || !query.data) return
    const sig = `${query.data.USD}|${query.data.EUR}`
    const prev = balanceSigRef.current
    balanceSigRef.current = sig
    if (prev != null && prev !== sig) {
      markRecentMoneyActivity()
      void qc.invalidateQueries({ queryKey: qk.transactions.root(scope), refetchType: 'active' })
      void qc.invalidateQueries({ queryKey: qk.transactions.root(scope), refetchType: 'inactive' })
    }
  }, [query.data, scope, qc])

  return query
}

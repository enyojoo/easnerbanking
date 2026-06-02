import React from 'react'
import { AppState, AppStateStatus, Platform } from 'react-native'
import { QueryClientProvider, focusManager } from '@tanstack/react-query'
import { qk, isChannelHealthy } from '@easner/shared'
import { getMobileQueryClient } from './client'
import { startQueryPersistence, clearPersistedQueryCache } from './persister'
import { PersonalScopeProvider, useScope } from './scope'
import { useSupabaseRealtimeScope } from './use-supabase-realtime-scope'
import { RealtimeHealthProvider, useRealtimeHealth } from './realtime-health-context'
import { useAuth } from '../contexts/AuthContext'
import { registerAppLockListener } from '../lib/app-lock-bus'
import { prefetchReceiveDepositQueries } from '../hooks/queries/use-receive-deposit-queries'
import { prefetchRecipientsList, RECIPIENTS_STALE_MS } from '../hooks/queries/use-recipients'
import { warmSendRateCachesFromRecipients } from '../lib/warmSendRateCaches'
import { recipientService } from '../lib/recipientService'

/**
 * Root Query provider for the mobile app. Owns:
 *   - one QueryClient for the lifetime of the JS bundle
 *   - AsyncStorage persistence (filtered to `meta.safePersist` queries)
 *   - AppState / NetInfo hooks for proper focus + online signals on RN
 *   - scope context for typed query keys
 *   - Supabase Realtime subscription for the active scope
 *
 * The persistence + online bridges are installed exactly once (module level)
 * so re-renders never duplicate subscriptions.
 */

// ---- RN bridges into TanStack Query -----------------------------------------
// focusManager: map AppState → focused/unfocused so `refetchOnWindowFocus`
// works the same as web. We still keep it OFF by default in the mobile
// QueryClient (see client.ts) but hooks can opt in per-query.
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
    handleFocus(status === 'active')
  })
  return () => sub.remove()
})

// NOTE on onlineManager: React Native has no `navigator.onLine`, so TanStack
// Query defaults to "always online" on RN. That's acceptable here — the
// `createBaseQueryClient` retry policy already backs off on network errors,
// and realtime health gives the UI a clear "reconnecting" signal. If we later
// add `@react-native-community/netinfo`, wire it in here with
// `onlineManager.setEventListener(...)`.

// Persistence is installed once at module load for the shared client.
const qc = getMobileQueryClient()
startQueryPersistence(qc)

function AuthGatedCacheReset({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const lastUserIdRef = React.useRef<string | null>(user?.id ?? null)

  React.useEffect(() => {
    const prev = lastUserIdRef.current
    const next = user?.id ?? null
    if (prev && !next) {
      // Logged out: drop in-memory + on-disk state so the next account
      // doesn't inherit the last user's queries.
      qc.cancelQueries()
      qc.clear()
      void clearPersistedQueryCache()
    } else if (prev && next && prev !== next) {
      // Account switch (rare on mobile; handle defensively).
      qc.cancelQueries()
      qc.clear()
      void clearPersistedQueryCache()
    }
    lastUserIdRef.current = next
  }, [user?.id])

  return <>{children}</>
}

/**
 * As soon as personal scope exists (signed-in user), warm caches for screens that should feel instant:
 * Receive deposit lines + recipient list (both rarely change; recipients also persist to disk).
 * Idempotent with Dashboard prefetch + `prefetchQuery` deduping in-flight work.
 */
function WarmOperationalCachesOnScope({ children }: { children: React.ReactNode }) {
  const { scope, isReady } = useScope()
  React.useEffect(() => {
    if (!isReady || !scope) return
    void prefetchReceiveDepositQueries(qc, scope)
    void prefetchRecipientsList(qc, scope)
    // Warm Noah + crypto send rates for each recipient corridor (same DB rows as quote).
    void (async () => {
      try {
        const recipients = await qc.fetchQuery({
          queryKey: qk.beneficiaries.list(scope),
          queryFn: () => recipientService.getByUserId(scope.userId),
          staleTime: RECIPIENTS_STALE_MS,
        })
        await warmSendRateCachesFromRecipients(qc, recipients)
      } catch {
        // Best-effort; SendAmount hooks refetch if cache miss.
      }
    })()
  }, [isReady, scope])
  return <>{children}</>
}

function ScopeRealtimeBridge({ children }: { children: React.ReactNode }) {
  // Read scope so we only mount the realtime hook once a user is present.
  const { isReady } = useScope()
  if (!isReady) return <>{children}</>
  return <RealtimeActive>{children}</RealtimeActive>
}

function ForegroundResumeRefresher({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const { scope, isReady } = useScope()
  const realtimeHealth = useRealtimeHealth()
  const lastRefreshAtRef = React.useRef(0)

  const refreshNow = React.useCallback(() => {
      if (!user?.id || !scope || !isReady) return
      if (isChannelHealthy(realtimeHealth)) return
      const now = Date.now()
      const MIN_INTERVAL_MS = 10_000
      if (now - lastRefreshAtRef.current < MIN_INTERVAL_MS) return
      lastRefreshAtRef.current = now

      void qc.refetchQueries({ queryKey: qk.wallets.root(scope), type: 'active' })
      void qc.refetchQueries({ queryKey: qk.transactions.root(scope), type: 'active' })
      void qc.refetchQueries({ queryKey: ['exchange-rates', 'noah-send'], type: 'active' })
    }, [isReady, scope, user?.id, realtimeHealth])

  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (status) => {
      if (status === 'active') {
        refreshNow()
      }
    })
    return () => sub.remove()
  }, [refreshNow])

  React.useEffect(() => {
    const off = registerAppLockListener((event) => {
      if (event === 'unlocked') {
        refreshNow()
      }
    })
    return off
  }, [refreshNow])

  return <>{children}</>
}

function RealtimeActive({ children }: { children: React.ReactNode }) {
  const health = useSupabaseRealtimeScope()
  return (
    <RealtimeHealthProvider value={health}>
      <ForegroundResumeRefresher>{children}</ForegroundResumeRefresher>
    </RealtimeHealthProvider>
  )
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={qc}>
      <AuthGatedCacheReset>
        <PersonalScopeProvider>
          <WarmOperationalCachesOnScope>
            <ScopeRealtimeBridge>{children}</ScopeRealtimeBridge>
          </WarmOperationalCachesOnScope>
        </PersonalScopeProvider>
      </AuthGatedCacheReset>
    </QueryClientProvider>
  )
}

/** Re-exported for convenience so consumers only import from ./query. */
export { useScope, useMaybeScope } from './scope'
export { useSupabaseRealtimeScope } from './use-supabase-realtime-scope'
export { getMobileQueryClient, resetQueryClient } from './client'
// Silence unused Platform import in some build profiles.
void Platform

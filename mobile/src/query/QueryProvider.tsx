import React from 'react'
import { AppState, AppStateStatus, Platform } from 'react-native'
import { focusManager, useIsRestoring } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { qk, type PersonalScope } from '@easner/shared'
import { getMobileQueryClient } from './client'
import {
  clearPersistedQueryCache,
  createMobileQueryPersister,
  MOBILE_APP_BUILD_ID,
  MOBILE_QUERY_MAX_AGE_MS,
  shouldPersistMobileQuery,
} from './persister'
import { PersonalScopeProvider, useScope } from './scope'
import { useSupabaseRealtimeScope } from './use-supabase-realtime-scope'
import { RealtimeHealthProvider, useRealtimeHealth } from './realtime-health-context'
import { useAuth } from '../contexts/AuthContext'
import { registerAppLockListener } from '../lib/app-lock-bus'
import { prefetchReceiveDepositQueries } from '../hooks/queries/use-receive-deposit-queries'
import { prefetchRecipientsList, RECIPIENTS_STALE_MS } from '../hooks/queries/use-recipients'
import { warmSendRateCachesFromRecipients } from '../lib/warmSendRateCaches'
import { recipientService } from '../lib/recipientService'
import {
  resolveWarmYcLocalDepositCorridor,
  ensureYcLocalDepositCachesReady,
  hydrateReceiveRailsFromDisk,
} from '../lib/warmYcLocalDepositCaches'
import { refreshLiveOperationalData } from './refresh-money-feeds'
import {
  FOREGROUND_BACKGROUND_THRESHOLD_MS,
  hasStaleOperationalQueries,
  shouldRefreshOnForeground,
} from './foreground-refresh'

/**
 * Root Query provider for the mobile app. Owns:
 *   - one QueryClient for the lifetime of the JS bundle
 *   - AsyncStorage persistence (filtered to `meta.safePersist` queries)
 *   - AppState / NetInfo hooks for proper focus + online signals on RN
 *   - scope context for typed query keys
 *   - Supabase Realtime subscription for the active scope
 */

focusManager.setEventListener((handleFocus) => {
  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') return () => {}
    handleFocus(true)
    return () => {}
  }
  const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
    handleFocus(status === 'active')
  })
  return () => sub.remove()
})

const qc = getMobileQueryClient()
const mobilePersister = createMobileQueryPersister()

function AuthGatedCacheReset({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const lastUserIdRef = React.useRef<string | null>(user?.id ?? null)

  React.useEffect(() => {
    const prev = lastUserIdRef.current
    const next = user?.id ?? null
    if (prev && !next) {
      qc.cancelQueries()
      qc.clear()
      void clearPersistedQueryCache()
    } else if (prev && next && prev !== next) {
      qc.cancelQueries()
      qc.clear()
      void clearPersistedQueryCache()
    }
    lastUserIdRef.current = next
  }, [user?.id])

  return <>{children}</>
}

function WarmYcLocalDepositCachesOnScope({ children }: { children: React.ReactNode }) {
  const { userProfile, loading: authLoading } = useAuth()
  React.useEffect(() => {
    void hydrateReceiveRailsFromDisk()
  }, [])
  React.useEffect(() => {
    if (authLoading) return
    const corridor = resolveWarmYcLocalDepositCorridor(userProfile)
    if (!corridor) return
    void ensureYcLocalDepositCachesReady(corridor)
  }, [userProfile?.residence_country, userProfile?.noah_kyc_status, authLoading])
  return <>{children}</>
}

function WarmOperationalCachesOnScope({ children }: { children: React.ReactNode }) {
  const { scope, isReady } = useScope()
  const { loading: authLoading } = useAuth()
  React.useEffect(() => {
    if (!isReady || !scope || authLoading) return
    void prefetchReceiveDepositQueries(qc, scope)
    void prefetchRecipientsList(qc, scope)
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
  }, [isReady, scope, authLoading])
  return <>{children}</>
}

function ScopeRealtimeBridge({ children }: { children: React.ReactNode }) {
  const { isReady } = useScope()
  if (!isReady) return <>{children}</>
  return <RealtimeActive>{children}</RealtimeActive>
}

function ForegroundResumeRefresher({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const { scope, isReady } = useScope()
  const realtimeHealth = useRealtimeHealth()
  const lastRefreshAtRef = React.useRef(0)
  const lastBackgroundAtRef = React.useRef<number | null>(null)

  const refreshNow = React.useCallback(() => {
    if (!user?.id || !scope || !isReady) return
    const now = Date.now()
    const MIN_INTERVAL_MS = 10_000
    if (now - lastRefreshAtRef.current < MIN_INTERVAL_MS) return

    const staleOperational = hasStaleOperationalQueries(qc, scope, now)
    const shouldRefresh = shouldRefreshOnForeground({
      lastBackgroundAt: lastBackgroundAtRef.current,
      nowMs: now,
      realtimeHealth,
      hasStaleOperationalQueries: staleOperational,
    })
    if (!shouldRefresh) return

    lastRefreshAtRef.current = now
    void refreshLiveOperationalData(scope as PersonalScope)
  }, [isReady, scope, user?.id, realtimeHealth])

  React.useEffect(() => {
    if (Platform.OS === 'web') return
    const sub = AppState.addEventListener('change', (status) => {
      if (status === 'background' || status === 'inactive') {
        lastBackgroundAtRef.current = Date.now()
      }
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
    <PersistQueryClientProvider
      client={qc}
      persistOptions={{
        persister: mobilePersister,
        buster: MOBILE_APP_BUILD_ID,
        maxAge: MOBILE_QUERY_MAX_AGE_MS,
        dehydrateOptions: {
          shouldDehydrateQuery: shouldPersistMobileQuery,
          shouldDehydrateMutation: () => false,
        },
      }}
    >
      <AuthGatedCacheReset>
        <PersonalScopeProvider>
          <WarmOperationalCachesOnScope>
            <WarmYcLocalDepositCachesOnScope>
              <ScopeRealtimeBridge>{children}</ScopeRealtimeBridge>
            </WarmYcLocalDepositCachesOnScope>
          </WarmOperationalCachesOnScope>
        </PersonalScopeProvider>
      </AuthGatedCacheReset>
    </PersistQueryClientProvider>
  )
}

/** Re-exported for convenience so consumers only import from ./query. */
export { useScope, useMaybeScope } from './scope'
export { useSupabaseRealtimeScope } from './use-supabase-realtime-scope'
export { getMobileQueryClient, resetQueryClient } from './client'
export { useIsRestoring }
export { FOREGROUND_BACKGROUND_THRESHOLD_MS }
void Platform

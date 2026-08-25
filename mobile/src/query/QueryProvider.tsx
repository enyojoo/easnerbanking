import React from 'react'
import { AppState, AppStateStatus, Platform } from 'react-native'
import { focusManager, onlineManager, useIsRestoring } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { qk, type PersonalScope } from '@easner/shared'
import { getMobileQueryClient } from './client'
import {
  clearPersistedQueryCache,
  createMobileQueryPersister,
  getRestoredQueryCacheOwnerId,
  MOBILE_APP_BUILD_ID,
  MOBILE_QUERY_MAX_AGE_MS,
  setPersistedQueryCacheOwner,
  shouldPersistMobileQuery,
} from './persister'
import { PersonalScopeProvider, useScope } from './scope'
import { useSupabaseRealtimeScope } from './use-supabase-realtime-scope'
import { RealtimeHealthProvider, useRealtimeHealth } from './realtime-health-context'
import { useAuth } from '../contexts/AuthContext'
import { registerAppLockListener } from '../lib/app-lock-bus'
import { prefetchReceiveDepositQueries } from '../hooks/queries/use-receive-deposit-queries'
import { hydrateReceiveRailsFromDisk } from '../lib/warmYcLocalDepositCaches'
import { warmOperationalRecipientCaches } from '../lib/warmOperationalRecipientCaches'
import { refreshLiveOperationalData } from './refresh-money-feeds'
import { refreshSendDestinations } from '../lib/sendDestinations'
import {
  FOREGROUND_BACKGROUND_THRESHOLD_MS,
  hasStaleOperationalQueries,
  shouldRefreshOnForeground,
} from './foreground-refresh'

/**
 * Root Query provider for the mobile app. Owns:
 *   - one QueryClient for the lifetime of the JS bundle
 *   - AsyncStorage persistence (filtered to `meta.safePersist` queries)
 *   - AppState (native) / visibility (web) hooks for the focus signal
 *   - scope context for typed query keys
 *   - Supabase Realtime subscription for the active scope
 */

focusManager.setEventListener((handleFocus) => {
  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') return () => {}
    // Real visibility tracking — the old branch latched focus to `true`
    // forever, which made every per-hook `refetchOnWindowFocus: true` inert
    // on the web target.
    const onVisibility = () => handleFocus(document.visibilityState === 'visible')
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
    }
  }
  const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
    handleFocus(status === 'active')
  })
  return () => sub.remove()
})

/**
 * Online signal (M3.2): with `networkMode: 'online'` and RN's absent
 * `window.online` events, onlineManager was permanently `true` — queries
 * fired into a dead network on airplane mode, and nothing resumed when
 * connectivity returned. With NetInfo wired, TanStack pauses in-flight work
 * offline and auto-resumes it online; the realtime resubscribe catch-up
 * sweep handles data freshness for the gap. Guarded `require`: a dev client
 * built before @react-native-community/netinfo was added must not crash —
 * it just keeps the old always-online behavior until the next native build.
 */
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const NetInfo = require('@react-native-community/netinfo').default
    onlineManager.setEventListener((setOnline) =>
      NetInfo.addEventListener((state: { isConnected: boolean | null }) => {
        setOnline(state.isConnected !== false)
      }),
    )
  } catch {
    // Native module not present in this binary yet.
  }
}

const qc = getMobileQueryClient()
const mobilePersister = createMobileQueryPersister()

function AuthGatedCacheReset({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const lastUserIdRef = React.useRef<string | null>(user?.id ?? null)

  React.useEffect(() => {
    const prev = lastUserIdRef.current
    const next = user?.id ?? null
    // Keep the persister stamping payloads with the current owner (M3.5).
    setPersistedQueryCacheOwner(next)
    if (prev && !next) {
      qc.cancelQueries()
      qc.clear()
      void clearPersistedQueryCache()
    } else if (prev && next && prev !== next) {
      qc.cancelQueries()
      qc.clear()
      void clearPersistedQueryCache()
    } else if (next) {
      // M3.5 boot-order case: the disk cache restored *before* auth resolved.
      // If the restored payload was owned by a different user, drop it —
      // otherwise user A's cached data could render under user B for the
      // first few hundred ms on a shared device. `null` owner (legacy or
      // pre-auth persist) is "unknown" and is left alone, matching the old
      // behavior. The persister also refuses mismatched payloads when auth
      // resolves first (see persister.ts deserialize).
      const restoredOwner = getRestoredQueryCacheOwnerId()
      if (typeof restoredOwner === 'string' && restoredOwner !== next) {
        qc.cancelQueries()
        qc.clear()
        void clearPersistedQueryCache()
      }
    }
    lastUserIdRef.current = next
  }, [user?.id])

  return <>{children}</>
}

function WarmYcLocalDepositCachesOnScope({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    void hydrateReceiveRailsFromDisk()
  }, [])
  return <>{children}</>
}

function WarmOperationalCachesOnScope({ children }: { children: React.ReactNode }) {
  const { scope, isReady } = useScope()
  const { userProfile, loading: authLoading } = useAuth()
  React.useEffect(() => {
    if (!isReady || !scope || authLoading) return
    void prefetchReceiveDepositQueries(qc, scope)
    void refreshSendDestinations().catch(() => undefined)
    void warmOperationalRecipientCaches(qc, scope, { profile: userProfile }).catch(() => undefined)
  }, [isReady, scope, authLoading, userProfile?.residence_country, userProfile?.noah_kyc_status])
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
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return
      const onVisible = () => {
        if (document.visibilityState === 'visible') {
          refreshNow()
        } else {
          lastBackgroundAtRef.current = Date.now()
        }
      }
      document.addEventListener('visibilitychange', onVisible)
      return () => document.removeEventListener('visibilitychange', onVisible)
    }
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
  const { refreshUserProfile } = useAuth()
  const onIdentityChange = React.useCallback(() => {
    void refreshUserProfile()
  }, [refreshUserProfile])
  const health = useSupabaseRealtimeScope({ onIdentityChange })
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

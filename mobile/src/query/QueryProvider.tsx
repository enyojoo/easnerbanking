import React from 'react'
import { AppState, AppStateStatus, Platform } from 'react-native'
import { QueryClientProvider, focusManager } from '@tanstack/react-query'
import { getMobileQueryClient } from './client'
import { startQueryPersistence, clearPersistedQueryCache } from './persister'
import { PersonalScopeProvider, useScope } from './scope'
import { useSupabaseRealtimeScope } from './use-supabase-realtime-scope'
import { RealtimeHealthProvider } from './realtime-health-context'
import { useAuth } from '../contexts/AuthContext'

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

function ScopeRealtimeBridge({ children }: { children: React.ReactNode }) {
  // Read scope so we only mount the realtime hook once a user is present.
  const { isReady } = useScope()
  if (!isReady) return <>{children}</>
  return <RealtimeActive>{children}</RealtimeActive>
}

function RealtimeActive({ children }: { children: React.ReactNode }) {
  const health = useSupabaseRealtimeScope()
  return <RealtimeHealthProvider value={health}>{children}</RealtimeHealthProvider>
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={qc}>
      <AuthGatedCacheReset>
        <PersonalScopeProvider>
          <ScopeRealtimeBridge>{children}</ScopeRealtimeBridge>
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

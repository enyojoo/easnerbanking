"use client"

import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { ThemeProvider } from "@/components/theme-provider"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { InvoiceModuleStoreSync } from "@/lib/invoice-module-store-sync"
import { BusinessScopeProvider, useScope } from "@/lib/query/scope"
import { getBrowserQueryClient } from "@/lib/query/query-client"
import { useSupabaseRealtimeScope } from "@/lib/query/use-supabase-realtime-scope"
import { RealtimeHealthProvider } from "@/lib/query/realtime-health-context"
import { useAuth } from "@/lib/auth-context"
import { ensureBusinessAppSession } from "@/lib/app-session-client"
import {
  BUSINESS_WEB_QUERY_CACHE_BUSTER,
  BUSINESS_WEB_QUERY_CACHE_MAX_AGE_MS,
  createBusinessQueryPersister,
  probeStoredSupabaseSession,
  shouldPersistBusinessQuery,
  writeBusinessStartupSnapshot,
  clearAllBusinessBrowserState,
} from "@/lib/query/web-persist"
import { BusinessIntercom } from "@/components/intercom-business"
import { ImageWarmBootstrap } from "@/components/image-warm-bootstrap"
import {
  hasWarmWorkspaceCache,
  prefetchWorkspaceCriticalData,
  refetchStaleReducedQueries,
} from "@/lib/query/workspace-prefetch"

/**
 * Root client provider tree for Easner Business.
 *
 * Order matters:
 *   1. QueryClientProvider wraps everything so nested server components
 *      can render `<HydrationBoundary state={dehydrate(qc)}>` around
 *      their subtree without re-creating the cache.
 *   2. BusinessScopeProvider depends on `AuthContext` (mounted above
 *      `<Providers>` in `app/layout.tsx`) — scope resolves as soon as
 *      the Supabase session comes back.
 *   3. The realtime bridge mounts inside the scope so a single channel
 *      is active per entity and persists across navigations.
 *   4. InvoiceModuleStoreSync mirrors the invoices list query into the
 *      legacy invoice module store for code paths that still read it.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getBrowserQueryClient()
  const { user } = useAuth()
  const restoredSessionUserId = React.useMemo(() => {
    const probe = probeStoredSupabaseSession()
    return probe.likelyAuthenticated ? probe.userId : null
  }, [])
  const persistedUserId = user?.id ?? restoredSessionUserId
  const persister = React.useMemo(
    () => createBusinessQueryPersister(persistedUserId),
    [persistedUserId],
  )

  return (
    <ThemeProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          buster: BUSINESS_WEB_QUERY_CACHE_BUSTER,
          maxAge: BUSINESS_WEB_QUERY_CACHE_MAX_AGE_MS,
          dehydrateOptions: {
            shouldDehydrateQuery: shouldPersistBusinessQuery,
          },
        }}
      >
        <BusinessIntercom />
        <ImageWarmBootstrap />
        <BusinessScopeProvider>
          <ScopeRealtimeBridge>
            <PersistedBusinessLifecycleBridge />
            <WorkspaceDataWarmBridge />
            <InvoiceModuleStoreSync />
            {children}
          </ScopeRealtimeBridge>
        </BusinessScopeProvider>
        {process.env.NODE_ENV !== "production" ? (
          <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
        ) : null}
      </PersistQueryClientProvider>
    </ThemeProvider>
  )
}

function ScopeRealtimeBridge({ children }: { children: React.ReactNode }) {
  const { scope } = useScope()
  const health = useSupabaseRealtimeScope(scope)
  return <RealtimeHealthProvider value={health}>{children}</RealtimeHealthProvider>
}

function PersistedBusinessLifecycleBridge() {
  const { user } = useAuth()
  const { scope } = useScope()
  const queryClient = useQueryClient()

  React.useEffect(() => {
    if (!user?.id || !scope) return
    writeBusinessStartupSnapshot({
      userId: user.id,
      businessId: scope.orgId,
    })
  }, [scope, user?.id])

  React.useEffect(() => {
    if (!user?.id || !scope) return

    let cancelled = false
    const refreshActiveReducedQueries = async () => {
      try {
        await ensureBusinessAppSession()
        if (cancelled) return
        await refetchStaleReducedQueries(queryClient)
      } catch {
        // ignore background warm failures
      }
    }

    const w = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(() => {
        void refreshActiveReducedQueries()
      }, { timeout: 250 })
      return () => {
        cancelled = true
        w.cancelIdleCallback?.(id)
      }
    }

    const timeout = window.setTimeout(() => {
      void refreshActiveReducedQueries()
    }, 150)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [queryClient, scope, user?.id])

  React.useEffect(() => {
    if (typeof window === "undefined") return

    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return

      void (async () => {
        const ok = await ensureBusinessAppSession()
        if (!ok) {
          clearAllBusinessBrowserState(user?.id ?? null)
          if (!window.location.pathname.startsWith("/auth/")) {
            window.location.assign("/auth/login")
          }
          return
        }

        await refetchStaleReducedQueries(queryClient)
      })()
    }

    window.addEventListener("pageshow", onPageShow)
    return () => window.removeEventListener("pageshow", onPageShow)
  }, [queryClient, user?.id])

  return null
}

function WorkspaceDataWarmBridge() {
  const { scope } = useScope()
  const queryClient = useQueryClient()

  React.useEffect(() => {
    if (!scope) return
    if (!hasWarmWorkspaceCache(queryClient, scope)) {
      void prefetchWorkspaceCriticalData(queryClient, scope)
    }
  }, [queryClient, scope])

  return null
}

"use client"

import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { getBrowserQueryClient } from "@/lib/query/query-client"
import { OfficeRealtimeBridge } from "@/lib/query/attach-office-realtime-bridge"
import { useAuth } from "@/lib/auth-context"
import {
  OFFICE_WEB_QUERY_CACHE_BUSTER,
  OFFICE_WEB_QUERY_CACHE_MAX_AGE_MS,
  createOfficeQueryPersister,
  readStoredSupabaseSessionUserId,
  shouldPersistOfficeQuery,
} from "@/lib/query/web-persist"

export function OfficeQueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getBrowserQueryClient()
  const { user } = useAuth()
  const restoredSessionUserId = React.useMemo(() => readStoredSupabaseSessionUserId(), [])
  const persistedUserId = user?.id ?? restoredSessionUserId
  const persister = React.useMemo(
    () => createOfficeQueryPersister(persistedUserId),
    [persistedUserId],
  )

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        buster: OFFICE_WEB_QUERY_CACHE_BUSTER,
        maxAge: OFFICE_WEB_QUERY_CACHE_MAX_AGE_MS,
        dehydrateOptions: {
          shouldDehydrateQuery: shouldPersistOfficeQuery,
        },
      }}
    >
      <OfficeRealtimeBridge>
        <PersistedOfficeLifecycleBridge />
        {children}
      </OfficeRealtimeBridge>
      {process.env.NODE_ENV !== "production" ? (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      ) : null}
    </PersistQueryClientProvider>
  )
}

function PersistedOfficeLifecycleBridge() {
  const { user, isAdmin, loading: authLoading } = useAuth()
  const queryClient = useQueryClient()

  React.useEffect(() => {
    if (typeof window === "undefined" || authLoading || !user?.id || !isAdmin) return

    let cancelled = false
    const refreshActiveReducedQueries = async () => {
      try {
        if (cancelled) return
        await queryClient.invalidateQueries({
          predicate: (query) => query.meta?.webPersist === "reduced",
          refetchType: "active",
        })
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
  }, [authLoading, isAdmin, queryClient, user?.id])

  React.useEffect(() => {
    if (typeof window === "undefined") return

    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      void queryClient.invalidateQueries({
        predicate: (query) => query.meta?.webPersist === "reduced",
        refetchType: "active",
      })
    }

    window.addEventListener("pageshow", onPageShow)
    return () => window.removeEventListener("pageshow", onPageShow)
  }, [queryClient, user?.id])

  return null
}

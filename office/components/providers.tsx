"use client"

import * as React from "react"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { getBrowserQueryClient } from "@/lib/query/query-client"
import { OfficeRealtimeBridge } from "@/lib/query/attach-office-realtime-bridge"
import { useAuth } from "@/lib/auth-context"
import {
  OFFICE_WEB_QUERY_CACHE_BUSTER,
  OFFICE_WEB_QUERY_CACHE_MAX_AGE_MS,
  createOfficeQueryPersister,
  probeStoredOfficeUserId,
  shouldPersistOfficeQuery,
} from "@/lib/query/web-persist"

/**
 * Persisted query provider — the business app's pattern, for the same
 * Instant Standard: reloads paint every admin page from the on-device cache
 * immediately, then freshen silently. (There is deliberately NO global
 * fetching-activity bar here: background refreshes must be invisible,
 * matching business.)
 */
export function OfficeQueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getBrowserQueryClient()
  const { user } = useAuth()
  // Seeded synchronously: PersistQueryClientProvider restores exactly once,
  // on the first commit — a late-arriving user id would miss the restore.
  const [restoredUserId] = React.useState<string | null>(() => probeStoredOfficeUserId())
  const persistedUserId = user?.id ?? restoredUserId
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
        {children}
      </OfficeRealtimeBridge>
      {process.env.NODE_ENV !== "production" ? (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      ) : null}
    </PersistQueryClientProvider>
  )
}

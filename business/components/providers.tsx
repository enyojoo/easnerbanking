"use client"

import type React from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "@/components/theme-provider"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { CustomersProvider } from "@/lib/customers-context"
import { InvoicesProvider } from "@/lib/invoices-context"
import { BusinessScopeProvider, useScope } from "@/lib/query/scope"
import { getBrowserQueryClient } from "@/lib/query/query-client"
import { useSupabaseRealtimeScope } from "@/lib/query/use-supabase-realtime-scope"
import { RealtimeHealthProvider } from "@/lib/query/realtime-health-context"

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
 *   4. Legacy CustomersProvider / InvoicesProvider stay mounted during
 *      the migration and are removed in `web-migrate-contexts`.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getBrowserQueryClient()

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      storageKey="easner-business-theme"
    >
      <QueryClientProvider client={queryClient}>
      <BusinessScopeProvider>
        <ScopeRealtimeBridge>
          <CustomersProvider>
            <InvoicesProvider>{children}</InvoicesProvider>
          </CustomersProvider>
        </ScopeRealtimeBridge>
      </BusinessScopeProvider>
      {process.env.NODE_ENV !== "production" ? (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
      ) : null}
    </QueryClientProvider>
    </ThemeProvider>
  )
}

function ScopeRealtimeBridge({ children }: { children: React.ReactNode }) {
  const { scope } = useScope()
  const health = useSupabaseRealtimeScope(scope)
  return <RealtimeHealthProvider value={health}>{children}</RealtimeHealthProvider>
}

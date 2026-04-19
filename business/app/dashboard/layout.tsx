import type React from "react"
import { HydrationBoundary, dehydrate } from "@tanstack/react-query"
import { createBaseQueryClient, qk } from "@easner/shared"
import { DashboardShell } from "@/components/dashboard-shell"
import { getServerScope } from "@/lib/server/scope"
import { serverApiFetch } from "@/lib/server/api"
import type { TransactionWithSource } from "@/lib/transactions"

/**
 * Server-rendered dashboard shell.
 *
 * - Creates a per-request QueryClient (never reused across requests).
 * - Prefetches only the query the current dashboard screen actually reads
 *   on first paint: the first page of transactions.
 * - Avoids blocking navigation on unused server prefetches; the balance
 *   card still hydrates through its existing client cache path.
 * - Dehydrates into `<HydrationBoundary>` so the browser's singleton
 *   QueryClient (from `components/providers.tsx`) picks them up instantly.
 * - Never throws on prefetch failure: the client re-queries and renders
 *   its own inline error.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const scope = await getServerScope()
  const qc = createBaseQueryClient()

  if (scope) {
    await qc.prefetchInfiniteQuery({
      queryKey: qk.transactions.list(scope, {}),
      initialPageParam: null,
      queryFn: async () => {
        const body = await serverApiFetch<{ transactions: TransactionWithSource[] }>(
          "/api/transactions?limit=50",
        )
        return { transactions: body.transactions ?? [], nextCursor: null }
      },
      staleTime: 30_000,
    })
  }

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <DashboardShell constrained>{children}</DashboardShell>
    </HydrationBoundary>
  )
}

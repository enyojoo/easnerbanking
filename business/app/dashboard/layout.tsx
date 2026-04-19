import type React from "react"
import { HydrationBoundary, dehydrate } from "@tanstack/react-query"
import { createBaseQueryClient, qk } from "@easner/shared"
import { DashboardShell } from "@/components/dashboard-shell"
import { getServerScope } from "@/lib/server/scope"
import { serverApiFetch } from "@/lib/server/api"
import type { OnChainBalances, AvailableCurrencies, DepositAddresses } from "@/hooks/queries/use-wallets"
import type { TreasurySummary } from "@/hooks/queries/use-treasury"
import type { TransactionWithSource } from "@/lib/transactions"

/**
 * Server-rendered dashboard shell.
 *
 * - Creates a per-request QueryClient (never reused across requests).
 * - Prefetches the critical queries the dashboard will read on first
 *   paint: wallets, treasury summary, and the first page of transactions.
 * - Dehydrates into `<HydrationBoundary>` so the browser's singleton
 *   QueryClient (from `components/providers.tsx`) picks them up instantly.
 * - Never throws on prefetch failure: the client re-queries and renders
 *   its own inline error.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const scope = await getServerScope()
  const qc = createBaseQueryClient()

  if (scope) {
    await Promise.allSettled([
      qc.prefetchQuery({
        queryKey: qk.wallets.list(scope),
        queryFn: async () => {
          const [balances, available, deposits] = await Promise.all([
            serverApiFetch<OnChainBalances>("/api/wallets/on-chain-balances"),
            serverApiFetch<AvailableCurrencies>("/api/accounts/available-currencies"),
            serverApiFetch<DepositAddresses>("/api/wallets/deposit-addresses"),
          ])
          return { balances, available, deposits }
        },
        staleTime: 15_000,
      }),
      qc.prefetchQuery({
        queryKey: qk.treasury.summary(scope),
        queryFn: () => serverApiFetch<TreasurySummary>("/api/business/treasury/summary"),
        staleTime: 60_000,
      }),
      qc.prefetchInfiniteQuery({
        queryKey: qk.transactions.list(scope, {}),
        initialPageParam: null,
        queryFn: async () => {
          const body = await serverApiFetch<{ transactions: TransactionWithSource[] }>(
            "/api/transactions?limit=50",
          )
          return { transactions: body.transactions ?? [], nextCursor: null }
        },
        staleTime: 30_000,
      }),
    ])
  }

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <DashboardShell constrained>{children}</DashboardShell>
    </HydrationBoundary>
  )
}

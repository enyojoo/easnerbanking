import { HydrationBoundary, dehydrate } from "@tanstack/react-query"
import { headers } from "next/headers"
import { createBaseQueryClient, qk } from "@easner/shared"
import { DashboardPageClient } from "./dashboard-page-client"
import { serverApiFetch } from "@/lib/server/api"
import { isNextjsAppRouterFlightRequest } from "@/lib/server/next-flight-request"
import { getServerScope } from "@/lib/server/scope"
import type { TransactionWithSource } from "@/lib/transactions"

const LEDGER_BUSINESS_HEADERS = { "X-Easner-Noah-Scope": "business" } as const

export default async function DashboardPage() {
  const h = await headers()

  if (isNextjsAppRouterFlightRequest(h)) {
    return <DashboardPageClient />
  }

  const scope = await getServerScope()
  const qc = createBaseQueryClient()

  if (scope) {
    try {
      await qc.prefetchInfiniteQuery({
        queryKey: qk.transactions.list(scope, {}),
        initialPageParam: null,
        queryFn: async () => {
          const body = await serverApiFetch<{ transactions: TransactionWithSource[] }>(
            "/api/transactions?limit=50",
            { headers: { ...LEDGER_BUSINESS_HEADERS } },
          )
          return { transactions: body.transactions ?? [], nextCursor: null }
        },
        staleTime: 30_000,
      })
    } catch {
      // Non-fatal: client refetches and shows inline errors.
    }
  }

  return (
    <HydrationBoundary state={dehydrate(qc)}>
      <DashboardPageClient />
    </HydrationBoundary>
  )
}

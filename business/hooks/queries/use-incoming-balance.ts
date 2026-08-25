"use client"

import { useQuery } from "@tanstack/react-query"
import { pollingIntervalFor } from "@easner/shared"
import { useScope } from "@/lib/query/scope"
import { useRealtimeHealth } from "@/lib/query/realtime-health-context"
import { useDocumentVisibility } from "@/lib/query/use-document-visibility"
import { incomingBalancesQueryOptions, type IncomingBalances } from "@/lib/query/workspace-prefetch"

export type { IncomingBalances }

/**
 * Unsettled Stripe invoice + checkout settlement totals by currency (Incoming on Accounts).
 * SUM(net_cents) WHERE phase IN ('payment_received','payout_sent').
 */
export function useIncomingBalances() {
  const { scope } = useScope()
  const realtimeHealth = useRealtimeHealth()
  const tabVisible = useDocumentVisibility()
  const options = scope ? incomingBalancesQueryOptions(scope) : null

  return useQuery<IncomingBalances>({
    ...(options ?? {
      queryKey: ["wallets", "incoming-balances", "disabled"] as const,
      queryFn: async (): Promise<IncomingBalances> => ({}),
      staleTime: 15_000,
      gcTime: 10 * 60_000,
    }),
    enabled: Boolean(scope),
    // Cache-first: realtime (settlement tables) + gated polling + focus keep
    // this fresh; a forced network hit on every mount defeated instant paint.
    refetchOnWindowFocus: true,
    refetchInterval: tabVisible ? pollingIntervalFor("operational", realtimeHealth) : false,
    refetchIntervalInBackground: false,
  })
}

/** Incoming amount for a single currency (major units). */
export function useIncomingBalance(currency: string | undefined) {
  const query = useIncomingBalances()
  const code = (currency ?? "").toUpperCase()
  const amount = code ? Number(query.data?.[code] ?? 0) : 0
  return {
    ...query,
    amount: Number.isFinite(amount) ? amount : 0,
  }
}

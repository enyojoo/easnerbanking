"use client"

import { useQuery } from "@tanstack/react-query"
import { useScope } from "@/lib/query/scope"
import { incomingBalancesQueryOptions, type IncomingBalances } from "@/lib/query/workspace-prefetch"

export type { IncomingBalances }

/**
 * Unsettled Stripe invoice settlement totals by currency (Incoming on Accounts).
 * SUM(net_cents) WHERE phase IN ('payment_received','payout_sent').
 */
export function useIncomingBalances() {
  const { scope } = useScope()
  const options = scope ? incomingBalancesQueryOptions(scope) : null

  return useQuery<IncomingBalances>({
    ...(options ?? {
      queryKey: ["wallets", "incoming-balances", "disabled"] as const,
      queryFn: async (): Promise<IncomingBalances> => ({}),
      staleTime: 60_000,
      gcTime: 10 * 60_000,
    }),
    enabled: Boolean(scope),
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

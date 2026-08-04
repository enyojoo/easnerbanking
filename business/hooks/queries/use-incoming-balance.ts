"use client"

import { useQuery } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"

export type IncomingBalances = Record<string, number>

/**
 * Unsettled Stripe invoice settlement totals by currency (Incoming on Accounts).
 * SUM(net_cents) WHERE phase IN ('payment_received','payout_sent').
 */
export function useIncomingBalances() {
  const { scope } = useScope()
  const queryKey = scope
    ? ([...qk.wallets.root(scope), "incoming-balances"] as const)
    : (["wallets", "incoming-balances", "disabled"] as const)

  return useQuery({
    queryKey,
    enabled: Boolean(scope),
    staleTime: 15_000,
    queryFn: async () => {
      const res = await apiFetch<{ balances?: IncomingBalances }>(
        "/api/business/incoming-balances",
      )
      return (res.balances ?? {}) as IncomingBalances
    },
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

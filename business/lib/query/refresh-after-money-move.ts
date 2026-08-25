"use client"

import type { QueryClient } from "@tanstack/react-query"
import { markRecentMoneyActivity, qk, type Scope } from "@easner/shared"

/**
 * Refreshes ledger + wallet queries after a money-moving API call.
 *
 * Active (on-screen) queries refetch immediately. Inactive ones are only
 * MARKED invalidated — the shared `refetchOnMountWhenInvalidated` default
 * refetches them the moment their screen mounts, so navigating back still
 * shows fresh data. The old `type: "all"` eagerly refetched every unmounted
 * surface (including the expensive Turnkey balance path) on each send.
 */
export async function refetchBusinessMoneyQueries(qc: QueryClient, scope: Scope | null): Promise<void> {
  if (!scope) return
  markRecentMoneyActivity()
  const roots = [
    qk.transactions.root(scope),
    qk.wallets.root(scope),
    qk.wallets.incoming(scope),
    qk.collections.paymentLinks.root(scope),
  ]
  await Promise.all(
    roots.flatMap((queryKey) => [
      qc.invalidateQueries({ queryKey, refetchType: "none" }),
      qc.refetchQueries({ queryKey, type: "active" }),
    ]),
  )
}

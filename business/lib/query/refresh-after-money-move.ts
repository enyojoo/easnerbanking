"use client"

import type { QueryClient } from "@tanstack/react-query"
import { markRecentMoneyActivity, qk, type Scope } from "@easner/shared"

/**
 * Refetches ledger + wallet queries for the scope, including **inactive** observers
 * (e.g. user is on send confirm / transaction detail while dashboard list is unmounted).
 * Call after money-moving APIs so `/transactions` and Home recent activity update as soon
 * as the user navigates back – without waiting for realtime or focus refetch.
 */
export async function refetchBusinessMoneyQueries(qc: QueryClient, scope: Scope | null): Promise<void> {
  if (!scope) return
  markRecentMoneyActivity()
  await Promise.all([
    qc.refetchQueries({ queryKey: qk.transactions.root(scope), type: "all" }),
    qc.refetchQueries({ queryKey: qk.wallets.root(scope), type: "all" }),
    qc.refetchQueries({ queryKey: qk.wallets.incoming(scope), type: "all" }),
    qc.refetchQueries({ queryKey: qk.collections.paymentLinks.root(scope), type: "all" }),
  ])
}

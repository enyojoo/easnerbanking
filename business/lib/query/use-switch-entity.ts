"use client"

import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { scopeKey, scopesEqual, qk, type BusinessScope } from "@easner/shared"
import { apiFetch } from "./api-client"
import { useScope } from "./scope"

/**
 * Atomic entity switcher for the Easner Business app.
 *
 * Multi-entity UX rule: switching the active entity must never unmount
 * the shell. Instead we:
 *
 *   1. Cancel any in-flight queries for the previous scope so their
 *      responses don't land in the new cache slice.
 *   2. Prefetch the critical-freshness queries (wallets + first
 *      transactions page) for the next scope so the UI reconciles
 *      against real data immediately on render.
 *   3. Flip the active scope; realtime re-subscribes via its effect.
 *   4. Mark the old scope's caches `inactive` (keepPreviousData guards
 *      the transition, so nothing blinks).
 *
 * This helper does NOT manage the signed cookie — that's owned by the
 * auth layer. Call it from your entity picker AFTER the cookie has been
 * rotated server-side.
 */
export function useSwitchEntity() {
  const qc = useQueryClient()
  const { scope: current, setScope } = useScope()

  return useCallback(
    async (next: BusinessScope) => {
      if (scopesEqual(current, next)) return
      if (current) {
        await qc.cancelQueries({ queryKey: scopeKey(current) })
      }
      try {
        await Promise.all([
          qc.prefetchQuery({
            queryKey: qk.wallets.list(next),
            queryFn: () => apiFetch("/api/wallets/on-chain-balances"),
            staleTime: 15_000,
          }),
          qc.prefetchInfiniteQuery({
            queryKey: qk.transactions.list(next, {}),
            initialPageParam: null as string | null,
            queryFn: () => apiFetch("/api/transactions", { query: { limit: 50 } }),
            staleTime: 30_000,
          }),
        ])
      } catch {
        // Prefetch is best-effort; the live hooks will refetch on render.
      }
      setScope(next)
      if (current) {
        qc.invalidateQueries({ queryKey: scopeKey(current), refetchType: "inactive" })
      }
    },
    [qc, current, setScope],
  )
}

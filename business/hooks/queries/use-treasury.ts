"use client"

import { useQuery } from "@tanstack/react-query"
import { qk, type DateRange } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"

export interface TreasurySummary {
  totalBalanceUsd: number
  balancesByCurrency: Record<string, number>
  pendingTransfersUsd: number
  change30dPct: number | null
}

export interface CashflowPoint {
  date: string
  inflow: number
  outflow: number
  net: number
}

/**
 * Treasury summary card on the dashboard. 60s staleTime because the
 * aggregate changes slowly relative to individual balance ticks. The
 * realtime bridge marks this stale when any `wallet_balances` row
 * changes, so the card stays in sync without polling.
 */
export function useTreasurySummary() {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? qk.treasury.summary(scope) : ["treasury", "summary", "disabled"],
    enabled: Boolean(scope),
    queryFn: () => apiFetch<TreasurySummary>("/api/business/treasury/summary"),
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    meta: { safePersist: true, freshness: "operational" },
  })
}

/**
 * Cashflow chart data. Analytics-class data: a little stale is fine,
 * never realtime, and it lives in persisted cache on mobile for parity.
 */
export function useTreasuryCashflow(range: DateRange) {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope ? qk.treasury.cashflow(scope, range) : ["treasury", "cashflow", "disabled"],
    enabled: Boolean(scope),
    queryFn: () =>
      apiFetch<{ points: CashflowPoint[] }>("/api/business/treasury/cashflow", {
        query: { from: range.from ?? undefined, to: range.to ?? undefined },
      }),
    staleTime: 2 * 60_000,
    gcTime: 30 * 60_000,
    meta: { safePersist: true, freshness: "analytics" },
  })
}

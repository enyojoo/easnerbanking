"use client"

import { useEffect, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { pollingIntervalFor, qk, scopeKey } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"
import { useRealtimeHealth } from "@/lib/query/realtime-health-context"

const NOAH_HEADERS = { "X-Easner-Noah-Scope": "business" } as const
const WALLET_LIST_CACHE_KEY_PREFIX = "easner_business_wallets_list_v1_"

export interface OnChainBalances {
  USD?: string
  EUR?: string
  source?: "turnkey" | "none"
  detail?: string
  [currency: string]: string | undefined
}

export interface DepositAddresses {
  USD?: { address?: string }
  EUR?: { address?: string }
}

export interface AvailableCurrencies {
  enabledExtras?: string[]
}

/**
 * Aggregate balances query for the active scope.
 *
 * Talks to the same `/api/wallets/on-chain-balances` + `/api/accounts/available-currencies`
 * endpoints that `useBusinessAccountRows` used to poll by hand. Runs on a
 * 15s staleTime / 30s background fallback — the realtime bridge surgically
 * updates `qk.wallets.balance` on `wallet_balances` events so we rarely
 * have to hit this path outside of first load.
 *
 * Never optimistic: balances are authoritative server state only.
 */
export function useWalletBalances() {
  const { scope } = useScope()
  const realtimeHealth = useRealtimeHealth()
  const storageKey = useMemo(
    () => (scope ? `${WALLET_LIST_CACHE_KEY_PREFIX}${scopeKey(scope)}` : null),
    [scope],
  )

  const query = useQuery({
    queryKey: scope ? qk.wallets.list(scope) : ["wallets", "disabled"],
    enabled: Boolean(scope),
    queryFn: async () => {
      const [balances, available, deposits] = await Promise.all([
        apiFetch<OnChainBalances>("/api/wallets/on-chain-balances", { headers: NOAH_HEADERS }),
        apiFetch<AvailableCurrencies>("/api/accounts/available-currencies", {
          headers: NOAH_HEADERS,
        }),
        apiFetch<DepositAddresses>("/api/wallets/deposit-addresses", { headers: NOAH_HEADERS }),
      ])
      const detail = String(balances?.detail ?? "")
      const isTransientTurnkeyFailure =
        balances?.source === "none" &&
        (detail === "turnkey_balance_query_failed" || detail.startsWith("turnkey_balance_query_failed:"))
      if (isTransientTurnkeyFailure) {
        // Keep last known good values in Query cache when provider reads fail
        // briefly instead of flashing "0.00" on the dashboard.
        throw new Error("Transient Turnkey balance lookup failure")
      }
      return { balances, available, deposits }
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    // Fallback poll only; disabled when realtime is healthy (handled by
    // the realtime bridge invalidating `qk.wallets.list` on balance events).
    refetchInterval: pollingIntervalFor("critical", realtimeHealth),
    refetchIntervalInBackground: false,
    meta: { safePersist: false, freshness: "critical" },
    initialData: () => {
      if (!storageKey || typeof window === "undefined") return undefined
      try {
        const raw = window.localStorage.getItem(storageKey)
        if (!raw) return undefined
        const parsed = JSON.parse(raw) as {
          balances?: OnChainBalances
          available?: AvailableCurrencies
          deposits?: DepositAddresses
        }
        return {
          balances: parsed.balances ?? {},
          available: parsed.available ?? {},
          deposits: parsed.deposits ?? {},
        }
      } catch {
        return undefined
      }
    },
  })

  useEffect(() => {
    if (!storageKey || !query.data || typeof window === "undefined") return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(query.data))
    } catch {
      // Ignore storage quota/write errors.
    }
  }, [query.data, storageKey])

  return query
}

/**
 * Individual wallet balance by id. Primarily populated via the realtime
 * bridge's `setQueryData(qk.wallets.balance(...))`; this hook is only
 * used when a screen opens straight to a wallet detail view.
 */
export function useWalletBalance(walletId: string | null) {
  const { scope } = useScope()
  return useQuery({
    queryKey: scope && walletId
      ? qk.wallets.balance(scope, walletId)
      : ["wallets", "balance", "disabled"],
    enabled: Boolean(scope) && Boolean(walletId),
    queryFn: () => apiFetch<unknown>(`/api/wallets/balance/${walletId}`, { headers: NOAH_HEADERS }),
    staleTime: 15_000,
    gcTime: 10 * 60_000,
    meta: { safePersist: false, freshness: "critical" },
  })
}

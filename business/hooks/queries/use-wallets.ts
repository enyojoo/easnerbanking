"use client"

import { useQuery } from "@tanstack/react-query"
import { qk } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useScope } from "@/lib/query/scope"

const NOAH_HEADERS = { "X-Easner-Noah-Scope": "business" } as const

export interface OnChainBalances {
  USD?: string
  EUR?: string
  _hasUSD?: boolean
  _hasEUR?: boolean
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
  return useQuery({
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
      const hasUSD = Object.prototype.hasOwnProperty.call(balances ?? {}, "USD")
      const hasEUR = Object.prototype.hasOwnProperty.call(balances ?? {}, "EUR")
      return {
        balances: {
          ...balances,
          USD: hasUSD ? (typeof balances?.USD === "string" ? balances.USD : "0") : undefined,
          EUR: hasEUR ? (typeof balances?.EUR === "string" ? balances.EUR : "0") : undefined,
          _hasUSD: hasUSD,
          _hasEUR: hasEUR,
        },
        available,
        deposits,
      }
    },
    staleTime: 15_000,
    gcTime: 10 * 60_000,
    // Fallback poll only; disabled when realtime is healthy (handled by
    // the realtime bridge invalidating `qk.wallets.list` on balance events).
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    meta: { safePersist: false, freshness: "critical" },
  })
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

"use client"

import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { pollingIntervalFor, qk } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useDocumentVisibility } from "@/lib/query/use-document-visibility"
import { useScope } from "@/lib/query/scope"
import { useRealtimeHealth } from "@/lib/query/realtime-health-context"
import {
  readWalletListSnapshot,
  walletBalancesQueryOptions,
  writeWalletListSnapshot,
  type WalletBalancesData,
} from "@/lib/query/workspace-prefetch"

export type OnChainBalances = WalletBalancesData["balances"]
export type DepositAddresses = WalletBalancesData["deposits"]
export type AvailableCurrencies = WalletBalancesData["available"]

/**
 * Aggregate balances query for the active scope.
 *
 * Talks to the same `/api/wallets/on-chain-balances` + `/api/accounts/available-currencies`
 * endpoints that `useBusinessAccountRows` used to poll by hand. Runs on a
 * 15s staleTime / 30s background fallback – the realtime bridge surgically
 * updates `qk.wallets.balance` on `wallet_balances` events so we rarely
 * have to hit this path outside of first load.
 *
 * Never optimistic: balances are authoritative server state only.
 */
export function useWalletBalances() {
  const { scope } = useScope()
  const qc = useQueryClient()
  const realtimeHealth = useRealtimeHealth()
  const tabVisible = useDocumentVisibility()

  const baseOptions = scope ? walletBalancesQueryOptions(scope, qc) : null
  const query = useQuery({
    ...(baseOptions ?? {
      queryKey: ["wallets", "disabled"] as const,
      queryFn: async (): Promise<WalletBalancesData> => {
        throw new Error("Wallet balances query disabled")
      },
    }),
    enabled: Boolean(scope),
    initialData: scope ? () => readWalletListSnapshot(scope)?.data : undefined,
    initialDataUpdatedAt: scope ? () => readWalletListSnapshot(scope)?.savedAt : undefined,
    refetchInterval: tabVisible ? pollingIntervalFor("critical", realtimeHealth) : false,
    refetchIntervalInBackground: false,
  })

  useEffect(() => {
    if (!scope || !query.data) return
    if (query.data.balances?.source === "none") return
    writeWalletListSnapshot(scope, query.data)
  }, [query.data, scope])

  return query
}

/**
 * Individual wallet balance by id. Primarily populated via the realtime
 * bridge's `setQueryData(qk.wallets.balance(...))`; this hook is only
 * used when a screen opens straight to a wallet detail view.
 */
export function useWalletBalance(walletId: string | null) {
  const { scope } = useScope()
  const ACCOUNT_SCOPE_HEADERS = { "X-Easner-Account-Scope": "business" } as const
  return useQuery({
    queryKey: scope && walletId
      ? qk.wallets.balance(scope, walletId)
      : ["wallets", "balance", "disabled"],
    enabled: Boolean(scope) && Boolean(walletId),
    queryFn: () => apiFetch<unknown>(`/api/wallets/balance/${walletId}`, { headers: ACCOUNT_SCOPE_HEADERS }),
    staleTime: 15_000,
    gcTime: 10 * 60_000,
    meta: { safePersist: false, webPersist: "none", freshness: "critical" },
  })
}

"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import { useIsRestoring, useQuery, useQueryClient } from "@tanstack/react-query"
import { qk, isVaAnswerSettled, shouldShowBankDepositTab, resolveUsPayInModeFromCatalog, usPayInAllowsExpress, usPayInAllowsVa } from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useBusinessProfile } from "@/lib/use-business-profile"
import type { Account } from "@/lib/finance-types"
import { useWalletBalances } from "@/hooks/queries/use-wallets"
import { useScope } from "@/lib/query/scope"
import {
  canDisplayProvisionedFinancialData,
  canPerformNoahMoneyMovement,
} from "@/lib/compliance-display"
import { formatUserFacingFetchError, isFatalQueryFailure } from "@/lib/query/fetch-errors"
import { useSendDestinations } from "@/lib/use-send-destinations"

type VaJson = {
  hasAccount?: boolean
  currency?: string
  accountNumber?: string
  routingNumber?: string
  sortCode?: string
  iban?: string
  bic?: string
  bankName?: string
  bankAddress?: string
  accountHolderName?: string
  provider?: "grid" | "noah"
}

const ACCOUNT_SCOPE_HEADERS = { "X-Easner-Account-Scope": "business" } as const

function maskTail(s: string | undefined, visible = 4): string {
  if (!s) return "–"
  const t = s.replace(/\s/g, "")
  if (t.length <= visible) return t
  return `••••${t.slice(-visible)}`
}

export function parseBalanceString(bal: string | undefined): number {
  const n = parseFloat(String(bal ?? "0").replace(/,/g, ""))
  return Number.isFinite(n) ? n : 0
}

function normalizeAvailableExtras(input: string[] | undefined): string[] {
  return (input ?? []).map((c) => c.toUpperCase())
}

export function useBusinessAccountRows() {
  const queryClient = useQueryClient()
  const { scope } = useScope()
  const isRestoring = useIsRestoring()
  const { tier1Complete, isLoading: profileLoading, name, baseCurrency } = useBusinessProfile()
  const { bankCorridors, data: sendDestinations } = useSendDestinations()
  const usPayInMode = resolveUsPayInModeFromCatalog(bankCorridors, sendDestinations != null)
  const walletQuery = useWalletBalances()
  const lastKnownAuthoritativeBalancesRef = useRef<{ USD: string; EUR: string } | null>(null)

  const balancesSource = walletQuery.data?.balances?.source
  const isAuthoritativeBalanceRead =
    Boolean(walletQuery.data) &&
    (balancesSource === "turnkey" || balancesSource === "db" || balancesSource === "realtime")

  useEffect(() => {
    if (!isAuthoritativeBalanceRead) return
    lastKnownAuthoritativeBalancesRef.current = {
      USD: String(walletQuery.data?.balances?.USD ?? "0"),
      EUR: String(walletQuery.data?.balances?.EUR ?? "0"),
    }
  }, [isAuthoritativeBalanceRead, walletQuery.data?.balances?.EUR, walletQuery.data?.balances?.USD])

  const enabledExtras = useMemo(
    () => normalizeAvailableExtras(walletQuery.data?.available?.enabledExtras),
    [walletQuery.data?.available?.enabledExtras],
  )

  const hasStablecoinDeposits = Boolean(
    walletQuery.data?.deposits?.USD?.ownerAddress?.trim() ||
      walletQuery.data?.deposits?.EUR?.ownerAddress?.trim(),
  )

  const vaCurrencies = useMemo(() => {
    const extras = enabledExtras.filter((c) => c !== "USD" && c !== "EUR")
    return ["USD", "EUR", ...extras]
  }, [enabledExtras])

  const virtualAccountsQuery = useQuery({
    queryKey: scope ? qk.wallets.virtualAccounts(scope, vaCurrencies) : ["wallets", "virtual-accounts", "disabled"],
    enabled: Boolean(scope) && vaCurrencies.length > 0,
    queryFn: async () => {
      const batchable = vaCurrencies
        .map((c) => c.toLowerCase())
        .filter((c) => c === "usd" || c === "eur" || c === "gbp")
      const unsupported = vaCurrencies.filter((code) => {
        const cur = code.toLowerCase()
        return cur !== "usd" && cur !== "eur" && cur !== "gbp"
      })

      const out: Record<string, VaJson | null> = {}
      for (const code of unsupported) out[code] = null

      if (batchable.length > 0) {
        try {
          const data = await apiFetch<{ accounts?: Record<string, VaJson | null> }>(
            `/api/noah/virtual-accounts`,
            {
              query: { currencies: batchable.join(",") },
              headers: ACCOUNT_SCOPE_HEADERS,
            },
          )
          const accounts = data.accounts ?? {}
          for (const cur of batchable) {
            const code = cur.toUpperCase()
            out[code] = accounts[code] ?? accounts[cur] ?? null
          }
        } catch {
          for (const cur of batchable) out[cur.toUpperCase()] = null
        }
      }
      return out
    },
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    meta: { safePersist: false, freshness: "operational" },
  })

  const hasProvisionedVirtualAccounts = useMemo(
    () => Object.values(virtualAccountsQuery.data ?? {}).some((va) => Boolean(va?.hasAccount)),
    [virtualAccountsQuery.data],
  )

  const hasAnyProvisionedData = useMemo(() => {
    if (isAuthoritativeBalanceRead || lastKnownAuthoritativeBalancesRef.current) return true
    if (hasStablecoinDeposits) return true
    if (hasProvisionedVirtualAccounts) return true
    return false
  }, [hasProvisionedVirtualAccounts, hasStablecoinDeposits, isAuthoritativeBalanceRead])

  const canDisplayFinancialData = canDisplayProvisionedFinancialData(tier1Complete, hasAnyProvisionedData)
  const canMoveMoney = canPerformNoahMoneyMovement(tier1Complete)

  // Balances always reflect wallet state (KYB only gates deposit rails, not amounts).
  const balances = useMemo(
    () => ({
      USD: isAuthoritativeBalanceRead
        ? String(walletQuery.data?.balances?.USD ?? "0")
        : (lastKnownAuthoritativeBalancesRef.current?.USD ?? "0"),
      EUR: isAuthoritativeBalanceRead
        ? String(walletQuery.data?.balances?.EUR ?? "0")
        : (lastKnownAuthoritativeBalancesRef.current?.EUR ?? "0"),
    }),
    [
      isAuthoritativeBalanceRead,
      walletQuery.data?.balances?.EUR,
      walletQuery.data?.balances?.USD,
    ],
  )

  const stablecoinDeposit = useMemo(
    () => ({
      USD: tier1Complete ? String(walletQuery.data?.deposits?.USD?.ownerAddress ?? "") : "",
      EUR: tier1Complete ? String(walletQuery.data?.deposits?.EUR?.ownerAddress ?? "") : "",
    }),
    [
      tier1Complete,
      walletQuery.data?.deposits?.EUR?.ownerAddress,
      walletQuery.data?.deposits?.USD?.ownerAddress,
    ],
  )

  const refreshAccounts = useCallback(async () => {
    if (!scope) return
    await queryClient.invalidateQueries({ queryKey: qk.wallets.root(scope) })
  }, [queryClient, scope])

  useEffect(() => {
    const onRefresh = () => {
      void refreshAccounts()
    }
    window.addEventListener("easner-business-accounts-refresh", onRefresh)
    return () => window.removeEventListener("easner-business-accounts-refresh", onRefresh)
  }, [refreshAccounts])

  const displayName = name?.trim() || "Business"
  const vaByCurrency = useMemo(
    () => virtualAccountsQuery.data ?? {},
    [virtualAccountsQuery.data],
  )
  // Background refresh failures keep cached balances — only surface errors with no data.
  const loadError =
    isFatalQueryFailure(walletQuery)
      ? formatUserFacingFetchError(walletQuery.error, "Couldn’t load account balances")
      : isFatalQueryFailure(virtualAccountsQuery)
        ? formatUserFacingFetchError(virtualAccountsQuery.error, "Couldn’t load account details")
        : null

  const accountRows: Account[] = useMemo(() => {
    // Mirror mobile Receive: always show USD/EUR cards. When KYB is incomplete, Deposit
    // still shows the verification notice (rails omitted below); balances stay live.
    if (
      tier1Complete &&
      !isAuthoritativeBalanceRead &&
      !lastKnownAuthoritativeBalancesRef.current
    ) {
      return []
    }

    const codes = ["USD", "EUR", ...enabledExtras.filter((c) => c !== "USD" && c !== "EUR")] as Account["currency"][]
    return codes.map((currency) => {
      const va = vaByCurrency[currency]
      const bal =
        currency === "USD"
          ? parseBalanceString(balances.USD)
          : currency === "EUR"
            ? parseBalanceString(balances.EUR)
            : 0

      const hasVa = Boolean(tier1Complete && va?.hasAccount)
      const isNoahFiatRail = currency === "USD" || currency === "EUR" || currency === "GBP"
      const showBankDepositTab = isNoahFiatRail
        ? shouldShowBankDepositTab({
            verificationComplete: tier1Complete,
            vaSettled: isVaAnswerSettled({
              isFetched: virtualAccountsQuery.isFetched,
              hasCachedEntry: va != null,
            }),
            hasVirtualAccount: hasVa,
            ...(currency === "USD" ? { officeAllowsVa: usPayInAllowsVa(usPayInMode) } : {}),
          })
        : true
      const usdc = currency === "USD" || currency === "GBP"
      const eurc = currency === "EUR"
      const stablecoinAddress =
        currency === "EUR"
          ? stablecoinDeposit.EUR || undefined
          : stablecoinDeposit.USD || undefined

      return {
        id: `acc_${currency.toLowerCase()}`,
        currency,
        accountName: hasVa ? va?.accountHolderName || displayName : displayName,
        bankName: hasVa ? va?.bankName || "–" : "–",
        accountNumber: hasVa ? maskTail(va?.accountNumber ?? va?.iban) : "–",
        fullAccountNumber: hasVa ? va?.accountNumber ?? va?.iban ?? "" : "",
        routingNumber: currency === "USD" && hasVa ? va?.routingNumber : undefined,
        sortCode: currency === "GBP" && hasVa ? va?.sortCode ?? va?.routingNumber : undefined,
        iban: currency === "EUR" && hasVa ? va?.iban : undefined,
        bic: currency === "EUR" && hasVa ? va?.bic : undefined,
        bankAddress: hasVa ? va?.bankAddress : undefined,
        depositProvider: hasVa && va?.provider === "grid" ? "grid" : hasVa && va?.provider === "noah" ? "noah" : undefined,
        balance: bal,
        availableBalance: bal,
        status: tier1Complete ? "active" : "pending",
        stablecoinAddress,
        stablecoinChain: "Solana",
        stablecoinToken: usdc ? "USDC" : eurc ? "EURC" : "USDC",
        showBankDepositTab,
        ...(currency === "USD" ? { usPayInAllowsExpress: usPayInAllowsExpress(usPayInMode) } : {}),
      }
    })
  }, [
    balances.EUR,
    balances.USD,
    displayName,
    enabledExtras,
    isAuthoritativeBalanceRead,
    stablecoinDeposit.EUR,
    stablecoinDeposit.USD,
    tier1Complete,
    usPayInMode,
    vaByCurrency,
    virtualAccountsQuery.isFetched,
  ])

  const accountsProvisioning =
    tier1Complete &&
    !hasAnyProvisionedData &&
    !loadError &&
    (walletQuery.isFetched || virtualAccountsQuery.isFetched)

  const loading =
    !isRestoring &&
    (profileLoading ||
      (accountRows.length === 0 &&
        ((walletQuery.isPending && !walletQuery.data) ||
          (virtualAccountsQuery.isPending && !virtualAccountsQuery.data))) ||
      (tier1Complete &&
        accountRows.length === 0 &&
        !isAuthoritativeBalanceRead &&
        !lastKnownAuthoritativeBalancesRef.current))

  return {
    accountRows,
    loading,
    loadError,
    tier1Complete,
    accountsProvisioning,
    canDisplayFinancialData,
    canMoveMoney,
    hasProvisionedVirtualAccounts,
    profileLoading,
    refreshAccounts,
    accountScopeHeaders: ACCOUNT_SCOPE_HEADERS,
    displayName,
    balances,
    balancesSource: balancesSource ?? null,
    hasAuthoritativeBalances: isAuthoritativeBalanceRead,
    baseCurrency: baseCurrency?.toUpperCase() || "USD",
  }
}

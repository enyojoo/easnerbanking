"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import { useIsRestoring, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  qk,
  isVaAnswerSettled,
  shouldShowBankDepositTab,
  resolveVaPayInModeFromCatalog,
  usPayInAllowsExpress,
  usPayInAllowsVa,
  isSuspiciousAuthoritativeZeroRegression,
  scopeId,
  resolveBusinessDepositKyb,
  resolveBusinessLedgerPayInProvider,
} from "@easner/shared"
import { apiFetch } from "@/lib/query/api-client"
import { useBusinessProfile } from "@/lib/use-business-profile"
import type { Account } from "@/lib/finance-types"
import {
  SETTINGS_BRIDGE_FLOW_HREF,
  SETTINGS_VERIFICATION_FLOW_HREF,
} from "@/lib/compliance/cutover-comms"
import { useWalletBalances } from "@/hooks/queries/use-wallets"
import { useScope } from "@/lib/query/scope"
import {
  extractFiatBalanceMap,
  readWalletListDisplaySnapshot,
} from "@/lib/query/workspace-prefetch"
import {
  canDisplayProvisionedFinancialData,
  canPerformNoahMoneyMovement,
} from "@/lib/compliance-display"
import { formatUserFacingFetchError, isAccountRestrictionFetchError, isFatalQueryFailure } from "@/lib/query/fetch-errors"
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
  provider?: "grid" | "noah" | "bridge"
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
  const {
    tier1Complete,
    tier1VerificationStatus,
    bridgeKycComplete,
    bridgeKycStatus,
    isLoading: profileLoading,
    name,
    baseCurrency,
    businessRole,
  } = useBusinessProfile()
  const { bankCorridors, data: sendDestinations } = useSendDestinations()
  const catalogLoaded = sendDestinations != null
  const usdPayInMode = resolveVaPayInModeFromCatalog(bankCorridors, "USD", catalogLoaded)
  const eurPayInMode = resolveVaPayInModeFromCatalog(bankCorridors, "EUR", catalogLoaded)
  const usdPayInProvider = resolveBusinessLedgerPayInProvider(bankCorridors, "USD")
  const eurPayInProvider = resolveBusinessLedgerPayInProvider(bankCorridors, "EUR")
  const gridApproved = String(tier1VerificationStatus ?? "").toLowerCase() === "approved"
  const usdDepositKyb = resolveBusinessDepositKyb({
    currency: "USD",
    officePayIn: usdPayInProvider,
    gridApproved,
    bridgeApproved: bridgeKycComplete,
  })
  const eurDepositKyb = resolveBusinessDepositKyb({
    currency: "EUR",
    officePayIn: eurPayInProvider,
    gridApproved,
    bridgeApproved: bridgeKycComplete,
  })
  const walletQuery = useWalletBalances()
  const lastKnownAuthoritativeBalancesRef = useRef<Record<string, string> | null>(null)
  const lastSeededScopeKeyRef = useRef<string>("")
  const activeScopeKey = scope ? scopeId(scope) : ""
  if (lastSeededScopeKeyRef.current !== activeScopeKey) {
    lastSeededScopeKeyRef.current = activeScopeKey
    lastKnownAuthoritativeBalancesRef.current = scope
      ? extractFiatBalanceMap(
          readWalletListDisplaySnapshot(scope)?.data.balances as Record<string, unknown> | undefined,
        )
      : null
  }

  const balancesSource = walletQuery.data?.balances?.source
  const isAuthoritativeBalanceRead =
    Boolean(walletQuery.data) &&
    (balancesSource === "turnkey" || balancesSource === "db" || balancesSource === "realtime")
  const incomingFiatMap = extractFiatBalanceMap(walletQuery.data?.balances as Record<string, unknown> | undefined)
  const suspiciousZeroRegression = isSuspiciousAuthoritativeZeroRegression(
    balancesSource,
    walletQuery.data?.balances?.USD,
    walletQuery.data?.balances?.EUR,
    lastKnownAuthoritativeBalancesRef.current,
  )
  const isEffectiveAuthoritativeBalanceRead = isAuthoritativeBalanceRead && !suspiciousZeroRegression

  useEffect(() => {
    if (!isEffectiveAuthoritativeBalanceRead || !incomingFiatMap) return
    lastKnownAuthoritativeBalancesRef.current = incomingFiatMap
  }, [incomingFiatMap, isEffectiveAuthoritativeBalanceRead])

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
    if (isEffectiveAuthoritativeBalanceRead || lastKnownAuthoritativeBalancesRef.current) return true
    if (hasStablecoinDeposits) return true
    if (hasProvisionedVirtualAccounts) return true
    return false
  }, [hasProvisionedVirtualAccounts, hasStablecoinDeposits, isEffectiveAuthoritativeBalanceRead])

  const canDisplayFinancialData = canDisplayProvisionedFinancialData(tier1Complete, hasAnyProvisionedData)
  const canMoveMoney =
    canPerformNoahMoneyMovement(tier1Complete) && businessRole !== "Viewer"

  // Balances always reflect wallet state (KYB only gates deposit rails, not amounts).
  const balances = useMemo(() => {
    const raw = (walletQuery.data?.balances ?? {}) as Record<string, unknown>
    const last = lastKnownAuthoritativeBalancesRef.current
    const pick = (code: string) => {
      if (isEffectiveAuthoritativeBalanceRead) return String(raw[code] ?? last?.[code] ?? "0")
      return String(last?.[code] ?? raw[code] ?? "0")
    }
    const out: Record<string, string> = {
      USD: pick("USD"),
      EUR: pick("EUR"),
    }
    for (const key of Object.keys({ ...raw, ...(last ?? {}) })) {
      if (!/^[A-Z]{3}$/.test(key)) continue
      out[key] = pick(key)
    }
    return out
  }, [isEffectiveAuthoritativeBalanceRead, walletQuery.data?.balances])

  const stablecoinDeposit = useMemo(
    () => ({
      USD: usdDepositKyb.complete ? String(walletQuery.data?.deposits?.USD?.ownerAddress ?? "") : "",
      EUR: eurDepositKyb.complete ? String(walletQuery.data?.deposits?.EUR?.ownerAddress ?? "") : "",
    }),
    [
      usdDepositKyb.complete,
      eurDepositKyb.complete,
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
    isFatalQueryFailure(walletQuery) && !isAccountRestrictionFetchError(walletQuery.error)
      ? formatUserFacingFetchError(walletQuery.error, "Couldn’t load account balances")
      : isFatalQueryFailure(virtualAccountsQuery)
        ? formatUserFacingFetchError(virtualAccountsQuery.error, "Couldn’t load account details")
        : null

  const accountRows: Account[] = useMemo(() => {
    // Mirror mobile Receive: always show USD/EUR cards. When KYB is incomplete, Deposit
    // still shows the verification notice (rails omitted below); balances stay live.
    if (
      tier1Complete &&
      !isEffectiveAuthoritativeBalanceRead &&
      !lastKnownAuthoritativeBalancesRef.current
    ) {
      return []
    }

    const codes = ["USD", "EUR", ...enabledExtras.filter((c) => c !== "USD" && c !== "EUR")] as Account["currency"][]
    return codes.map((currency) => {
      const va = vaByCurrency[currency]
      const bal = parseBalanceString(
        String((balances as Record<string, string | undefined>)[currency] ?? ""),
      )

      const depositKyb =
        currency === "USD" ? usdDepositKyb : currency === "EUR" ? eurDepositKyb : { complete: tier1Complete, product: "us_banking" as const }
      const hasVa = Boolean(depositKyb.complete && va?.hasAccount)
      const isNoahFiatRail = currency === "USD" || currency === "EUR" || currency === "GBP"
      const showBankDepositTab = isNoahFiatRail
        ? shouldShowBankDepositTab({
            verificationComplete: depositKyb.complete,
            vaSettled: isVaAnswerSettled({
              isFetched: virtualAccountsQuery.isFetched,
              hasCachedEntry: va != null,
            }),
            hasVirtualAccount: hasVa,
            ...(currency === "USD"
              ? { officeAllowsVa: usPayInAllowsVa(usdPayInMode) }
              : currency === "EUR"
                ? { officeAllowsVa: usPayInAllowsVa(eurPayInMode) }
                : {}),
          })
        : true
      const usdc = currency === "USD" || currency === "GBP"
      const eurc = currency === "EUR"
      const stablecoinAddress =
        currency === "EUR"
          ? stablecoinDeposit.EUR || undefined
          : stablecoinDeposit.USD || undefined
      const vaProvider = String(va?.provider ?? "").trim().toLowerCase()
      const depositKybStatus =
        depositKyb.product === "euro_banking"
          ? String(bridgeKycStatus || "not_started")
          : String(tier1VerificationStatus || "not_started")

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
        depositProvider:
          hasVa && (vaProvider === "grid" || vaProvider === "noah" || vaProvider === "bridge")
            ? vaProvider
            : undefined,
        balance: bal,
        availableBalance: bal,
        status: depositKyb.complete ? "active" : "pending",
        stablecoinAddress,
        stablecoinChain: "Solana",
        stablecoinToken: usdc ? "USDC" : eurc ? "EURC" : "USDC",
        showBankDepositTab,
        depositKybComplete: depositKyb.complete,
        depositKybProduct: depositKyb.product,
        depositKybStatus,
        depositKybHref:
          depositKyb.product === "euro_banking"
            ? SETTINGS_BRIDGE_FLOW_HREF
            : SETTINGS_VERIFICATION_FLOW_HREF,
        ...(currency === "USD" ? { usPayInAllowsExpress: usPayInAllowsExpress(usdPayInMode) } : {}),
      }
    })
  }, [
    balances,
    displayName,
    enabledExtras,
    isEffectiveAuthoritativeBalanceRead,
    stablecoinDeposit.EUR,
    stablecoinDeposit.USD,
    tier1Complete,
    usdPayInMode,
    eurPayInMode,
    usdDepositKyb,
    eurDepositKyb,
    bridgeKycStatus,
    tier1VerificationStatus,
    vaByCurrency,
    virtualAccountsQuery.isFetched,
  ])

  const accountsProvisioning =
    tier1Complete &&
    !hasAnyProvisionedData &&
    !loadError &&
    (walletQuery.isFetched || virtualAccountsQuery.isFetched)

  const hasHeldBalanceSnapshot = Boolean(lastKnownAuthoritativeBalancesRef.current)

  const loading =
    (!hasHeldBalanceSnapshot && isRestoring) ||
    (!hasHeldBalanceSnapshot &&
      (profileLoading ||
        (accountRows.length === 0 &&
          ((walletQuery.isPending && !walletQuery.data) ||
            (virtualAccountsQuery.isPending && !virtualAccountsQuery.data))) ||
        (tier1Complete &&
          accountRows.length === 0 &&
          !isEffectiveAuthoritativeBalanceRead)))

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
    hasAuthoritativeBalances: isEffectiveAuthoritativeBalanceRead,
    hasDisplayableBalances: hasHeldBalanceSnapshot || isEffectiveAuthoritativeBalanceRead,
    baseCurrency: baseCurrency?.toUpperCase() || "USD",
  }
}

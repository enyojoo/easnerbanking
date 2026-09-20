import type { InfiniteData, QueryClient } from "@tanstack/react-query"
import {
  isSuspiciousAuthoritativeZeroRegression,
  qk,
  scopeKey,
  type Scope,
} from "@easner/shared"
import {
  INVOICES_LIST_STALE_MS,
} from "@/lib/invoices/invoice-query-cache"
import { isAccountRestrictionFetchError } from "@/lib/query/fetch-errors"
import { apiFetch } from "@/lib/query/api-client"
import { getClientAppSurface } from "@/lib/app-surface"
import {
  BUSINESS_TRANSACTIONS_LIST_PAGE_SIZE,
  type TransactionsPage,
} from "@/hooks/queries/use-transactions"
import type {
  AvailableCurrencies,
  DepositAddresses,
  OnChainBalances,
} from "@/hooks/queries/use-wallets"

export type IncomingBalances = Record<string, number>

const ACCOUNT_SCOPE_HEADERS = { "X-Easner-Account-Scope": "business" } as const
const LEDGER_BUSINESS_HEADERS = { "X-Easner-Account-Scope": "business" } as const
const WALLET_LIST_CACHE_KEY_PREFIX = "easner_business_wallets_list_v1_"

export type WalletBalancesData = {
  balances: OnChainBalances
  available: AvailableCurrencies
  deposits: DepositAddresses
}

function getWalletListStorageKey(scope: Scope): string {
  return `${WALLET_LIST_CACHE_KEY_PREFIX}${scopeKey(scope)}`
}

/**
 * Snapshots must carry their age: seeding `initialData` without
 * `initialDataUpdatedAt` stamps the data as fetched-just-now, which defeats
 * staleTime, prefetch staleness checks, and the stale-query sweeps — an
 * arbitrarily old balance would render as authoritative and never revalidate.
 * Snapshots past the ceiling (and legacy ones without `savedAt`) are discarded
 * as query `initialData`. A longer display ceiling still seeds last-known
 * amounts so a stale tab does not flash $0.00 before the refetch lands.
 */
const WALLET_SNAPSHOT_FRESH_MS = 15 * 60 * 1000
const WALLET_SNAPSHOT_DISPLAY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export type WalletListSnapshot = {
  data: WalletBalancesData
  savedAt: number
}

function parseStoredWalletList(scope: Scope): WalletListSnapshot | undefined {
  if (typeof window === "undefined") return undefined
  const storageKey = getWalletListStorageKey(scope)
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as {
      balances?: OnChainBalances
      available?: AvailableCurrencies
      deposits?: DepositAddresses
      savedAt?: number
    }
    if (!parsed?.balances) return undefined
    if (
      parsed.balances.source !== "turnkey" &&
      parsed.balances.source !== "db" &&
      parsed.balances.source !== "realtime"
    ) {
      return undefined
    }
    if (typeof parsed.savedAt !== "number") return undefined
    return {
      data: {
        balances: parsed.balances ?? {},
        available: parsed.available ?? {},
        deposits: parsed.deposits ?? {},
      },
      savedAt: parsed.savedAt,
    }
  } catch {
    return undefined
  }
}

function snapshotWithinAge(snapshot: WalletListSnapshot | undefined, maxAgeMs: number): WalletListSnapshot | undefined {
  if (!snapshot) return undefined
  if (Date.now() - snapshot.savedAt > maxAgeMs) return undefined
  return snapshot
}

/** Fresh enough to seed TanStack `initialData` without hiding staleness. */
export function readWalletListSnapshot(scope: Scope): WalletListSnapshot | undefined {
  return snapshotWithinAge(parseStoredWalletList(scope), WALLET_SNAPSHOT_FRESH_MS)
}

/** Last-known amounts for display while a stale/in-flight refetch completes. */
export function readWalletListDisplaySnapshot(scope: Scope): WalletListSnapshot | undefined {
  return snapshotWithinAge(parseStoredWalletList(scope), WALLET_SNAPSHOT_DISPLAY_MAX_AGE_MS)
}

export function extractFiatBalanceMap(
  balances: Record<string, unknown> | null | undefined,
): Record<string, string> | null {
  if (!balances) return null
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(balances)) {
    if (!/^[A-Z]{3}$/.test(key)) continue
    if (typeof value !== "string" && typeof value !== "number") continue
    out[key] = String(value)
  }
  if (Object.keys(out).length === 0) return null
  if (out.USD == null) out.USD = "0"
  if (out.EUR == null) out.EUR = "0"
  return out
}

function previousBalancesForRegression(scope: Scope, queryClient: QueryClient): OnChainBalances | undefined {
  const cached = queryClient.getQueryData<WalletBalancesData>(qk.wallets.list(scope))?.balances
  const snap = readWalletListDisplaySnapshot(scope)?.data.balances
  // Prefer whichever side already has a non-zero USD/EUR so a persisted $0
  // envelope cannot hide a last-known snapshot (or vice versa).
  if (isSuspiciousAuthoritativeZeroRegression("db", "0", "0", cached)) return cached
  if (isSuspiciousAuthoritativeZeroRegression("db", "0", "0", snap)) return snap
  return cached ?? snap
}

export function writeWalletListSnapshot(scope: Scope, data: WalletBalancesData): void {
  if (typeof window === "undefined") return
  if (
    data.balances?.source !== "turnkey" &&
    data.balances?.source !== "db" &&
    data.balances?.source !== "realtime"
  ) {
    return
  }
  const existing = parseStoredWalletList(scope)?.data.balances
  if (
    isSuspiciousAuthoritativeZeroRegression(
      data.balances?.source,
      data.balances?.USD,
      data.balances?.EUR,
      existing,
    )
  ) {
    return
  }
  try {
    window.localStorage.setItem(
      getWalletListStorageKey(scope),
      JSON.stringify({ ...data, savedAt: Date.now() }),
    )
  } catch {
    // Ignore storage quota/write errors.
  }
}

export async function fetchWalletBalances(
  scope: Scope,
  queryClient: QueryClient,
): Promise<WalletBalancesData> {
  const queryKey = qk.wallets.list(scope)
  const emptyDeposits: DepositAddresses = {
    USD: { address: "", ownerAddress: "", stablecoin: "USDC", chain: "Solana", memo: "" },
    EUR: { address: "", ownerAddress: "", stablecoin: "EURC", chain: "Solana", memo: "" },
  }

  const [balances, available, deposits] = await Promise.all([
    apiFetch<OnChainBalances>("/api/wallets/on-chain-balances", { headers: ACCOUNT_SCOPE_HEADERS }),
    apiFetch<AvailableCurrencies>("/api/accounts/available-currencies", {
      headers: ACCOUNT_SCOPE_HEADERS,
    }),
    apiFetch<DepositAddresses>("/api/wallets/deposit-addresses", {
      query: { mode: "fast" },
      headers: ACCOUNT_SCOPE_HEADERS,
    }).catch((err) => {
      if (isAccountRestrictionFetchError(err)) return emptyDeposits
      throw err
    }),
  ])
  const detail = String(balances?.detail ?? "")
  const isTransientTurnkeyFailure =
    balances?.source === "none" &&
    (detail === "turnkey_balance_query_failed" || detail.startsWith("turnkey_balance_query_failed:"))
  if (isTransientTurnkeyFailure) {
    const prev = queryClient.getQueryData<WalletBalancesData>(queryKey)
    if (prev) return prev
    const snap = readWalletListDisplaySnapshot(scope)
    if (snap) return snap.data
    throw new Error("Transient Turnkey balance lookup failure")
  }
  const prev = queryClient.getQueryData<WalletBalancesData>(queryKey)
  const prevBalances = previousBalancesForRegression(scope, queryClient)
  if (
    isSuspiciousAuthoritativeZeroRegression(
      balances?.source,
      balances?.USD,
      balances?.EUR,
      prevBalances,
    )
  ) {
    if (prev?.balances && !isSuspiciousAuthoritativeZeroRegression("db", "0", "0", prev.balances)) {
      return prev
    }
    const snap = readWalletListDisplaySnapshot(scope)
    if (snap) return snap.data
    if (prev) return prev
    throw new Error("Suspicious authoritative zero balance regression")
  }
  return { balances, available, deposits }
}

export function walletBalancesQueryOptions(scope: Scope, queryClient: QueryClient) {
  return {
    queryKey: qk.wallets.list(scope),
    queryFn: () => fetchWalletBalances(scope, queryClient),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    meta: { safePersist: false, webPersist: "reduced", freshness: "critical" as const },
    initialData: () => readWalletListSnapshot(scope)?.data,
    initialDataUpdatedAt: () => readWalletListSnapshot(scope)?.savedAt,
  }
}

export function incomingBalancesQueryOptions(scope: Scope) {
  return {
    queryKey: qk.wallets.incoming(scope),
    queryFn: async () => {
      const res = await apiFetch<{ balances?: IncomingBalances }>("/api/business/incoming-balances")
      return (res.balances ?? {}) as IncomingBalances
    },
    staleTime: 15_000,
    gcTime: 10 * 60_000,
    meta: { safePersist: false, webPersist: "reduced", freshness: "operational" as const },
  }
}

export function transactionsListPrefetchOptions(scope: Scope) {
  const listFilters = { limit: BUSINESS_TRANSACTIONS_LIST_PAGE_SIZE }
  return {
    queryKey: qk.transactions.list(scope, listFilters),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      const body = await apiFetch<{ transactions: TransactionsPage["transactions"]; nextCursor?: string | null }>(
        "/api/transactions",
        {
          query: {
            cursor: pageParam ?? undefined,
            limit: BUSINESS_TRANSACTIONS_LIST_PAGE_SIZE,
          },
          headers: { ...LEDGER_BUSINESS_HEADERS },
        },
      )
      return {
        transactions: body.transactions ?? [],
        nextCursor: body.nextCursor ?? null,
      } satisfies TransactionsPage
    },
    getNextPageParam: (last: TransactionsPage) => last.nextCursor,
    staleTime: 90_000,
    gcTime: 30 * 60_000,
    meta: { safePersist: true, webPersist: "reduced", freshness: "operational" as const },
  }
}

export function hasWarmWorkspaceCache(queryClient: QueryClient, scope: Scope): boolean {
  const wallets = queryClient.getQueryData<WalletBalancesData>(qk.wallets.list(scope))
  const txData = queryClient.getQueryData<InfiniteData<TransactionsPage>>(
    qk.transactions.list(scope, { limit: BUSINESS_TRANSACTIONS_LIST_PAGE_SIZE }),
  )
  return Boolean(wallets) || Boolean(txData?.pages?.length)
}

export async function prefetchWorkspaceCriticalData(
  queryClient: QueryClient,
  scope: Scope,
): Promise<void> {
  await Promise.all([
    queryClient.prefetchQuery(walletBalancesQueryOptions(scope, queryClient)),
    queryClient.prefetchQuery(incomingBalancesQueryOptions(scope)),
    queryClient.prefetchInfiniteQuery(transactionsListPrefetchOptions(scope)),
  ])
}

export async function prefetchAccountsWorkspaceData(
  queryClient: QueryClient,
  scope: Scope,
): Promise<void> {
  await Promise.all([
    queryClient.prefetchQuery(walletBalancesQueryOptions(scope, queryClient)),
    queryClient.prefetchQuery(incomingBalancesQueryOptions(scope)),
  ])
}

export async function prefetchTransactionsWorkspaceData(
  queryClient: QueryClient,
  scope: Scope,
): Promise<void> {
  await queryClient.prefetchInfiniteQuery(transactionsListPrefetchOptions(scope))
}

export function invoicesListPrefetchOptions(scope: Scope) {
  return {
    queryKey: qk.invoices.list(scope, {}),
    queryFn: () => apiFetch<{ invoices: unknown[] }>("/api/business/b2b/invoices"),
    staleTime: INVOICES_LIST_STALE_MS,
    gcTime: 30 * 60_000,
    meta: { safePersist: true, webPersist: "reduced", freshness: "operational" as const },
  }
}

export function fxRatesPrefetchOptions() {
  return {
    queryKey: qk.fx.pairs(),
    queryFn: async () => {
      const body = await apiFetch<{ rates?: unknown[] }>("/api/fx/exchange-rates", {
        headers: ACCOUNT_SCOPE_HEADERS,
      })
      return body.rates ?? []
    },
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    meta: { safePersist: true, webPersist: "reduced", freshness: "reference" as const },
  }
}

export async function prefetchInvoicesWorkspaceData(
  queryClient: QueryClient,
  scope: Scope,
): Promise<void> {
  await queryClient.prefetchQuery(invoicesListPrefetchOptions(scope))
}

/** Cards page is transaction-backed; there is no `/api/business/cards` list yet. */
export async function prefetchCardsWorkspaceData(
  queryClient: QueryClient,
  scope: Scope,
): Promise<void> {
  await prefetchTransactionsWorkspaceData(queryClient, scope)
}

/** First-paint data for every sidebar destination. */
export async function prefetchAllNavWorkspaceData(
  queryClient: QueryClient,
  scope: Scope,
): Promise<void> {
  // Critical (current-surface) data first; the rest is deferred to idle time
  // so the warm-up burst doesn't land exactly when the user starts clicking.
  await Promise.allSettled([
    prefetchWorkspaceCriticalData(queryClient, scope),
    queryClient.prefetchQuery(fxRatesPrefetchOptions()),
  ])

  await new Promise<void>((resolve) => {
    const w = typeof window === "undefined" ? null : (window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
    })
    if (w && typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(() => resolve(), { timeout: 3_000 })
    } else {
      setTimeout(resolve, 500)
    }
  })

  if (getClientAppSurface() === "platform") {
    const { prefetchCheckoutSettings } = await import("@/hooks/queries/use-checkout-settings-query")
    await Promise.allSettled([prefetchCheckoutSettings(queryClient, scope)])
    return
  }

  const { payrollOverviewQueryOptions, payrollPeopleQueryOptions } = await import(
    "@/hooks/queries/use-payroll"
  )
  await Promise.allSettled([
    prefetchInvoicesWorkspaceData(queryClient, scope),
    prefetchCardsWorkspaceData(queryClient, scope),
    queryClient.prefetchQuery(payrollOverviewQueryOptions(scope)),
    queryClient.prefetchQuery(payrollPeopleQueryOptions(scope)),
  ])
}

/** Route-aware RQ prefetch for sidebar hover. */
export async function prefetchRouteWorkspaceData(
  queryClient: QueryClient,
  scope: Scope,
  href: string,
): Promise<void> {
  if (href === "/accounts" || href.startsWith("/accounts/")) {
    await prefetchAccountsWorkspaceData(queryClient, scope)
    return
  }
  if (href === "/invoices" || href.startsWith("/invoices/")) {
    await prefetchInvoicesWorkspaceData(queryClient, scope)
    return
  }
  if (href === "/payroll" || href.startsWith("/payroll/")) {
    const { payrollOverviewQueryOptions, payrollPeopleQueryOptions } = await import(
      "@/hooks/queries/use-payroll"
    )
    await Promise.all([
      queryClient.prefetchQuery(payrollOverviewQueryOptions(scope)),
      queryClient.prefetchQuery(payrollPeopleQueryOptions(scope)),
    ])
    return
  }
  if (href === "/send" || href.startsWith("/send/")) {
    await Promise.all([
      import("@/lib/use-send-destinations").then((m) => m.prefetchSendDestinations()),
      import("@/lib/use-payout-corridors").then((m) => m.prefetchPayoutCorridors()),
    ])
    return
  }
  if (href === "/cards" || href.startsWith("/cards/")) {
    await prefetchCardsWorkspaceData(queryClient, scope)
    return
  }
  if (href === "/links" || href.startsWith("/links/")) {
    const { prefetchPaymentLinks } = await import("@/hooks/queries/use-payment-links-query")
    const { prefetchCheckoutSettings } = await import("@/hooks/queries/use-checkout-settings-query")
    await Promise.all([
      prefetchPaymentLinks(queryClient, scope),
      prefetchCheckoutSettings(queryClient, scope),
    ])
    return
  }
  if (href === "/checkout" || href.startsWith("/checkout/") || href === "/console" || href.startsWith("/console/")) {
    const { prefetchCheckoutSettings } = await import("@/hooks/queries/use-checkout-settings-query")
    await prefetchCheckoutSettings(queryClient, scope)
    return
  }
  if (href === "/settings" || href.startsWith("/settings")) {
    const { prefetchCheckoutSettings } = await import("@/hooks/queries/use-checkout-settings-query")
    const { prefetchExpressOnrampStatus } = await import("@/hooks/queries/use-express-onramp-status-query")
    await Promise.all([
      prefetchCheckoutSettings(queryClient, scope),
      prefetchExpressOnrampStatus(queryClient, scope),
    ])
    return
  }
  if (
    href === "/dashboard" ||
    href.startsWith("/dashboard/") ||
    href === "/transactions" ||
    href.startsWith("/transactions/")
  ) {
    await Promise.all([
      prefetchTransactionsWorkspaceData(queryClient, scope),
      queryClient.prefetchQuery(fxRatesPrefetchOptions()),
    ])
  }
}

export function refetchStaleReducedQueries(queryClient: QueryClient): Promise<void> {
  return queryClient.refetchQueries({
    predicate: (query) => {
      // Money surfaces are in scope whether or not they persist to disk:
      // gating on `webPersist === "reduced"` alone excluded transaction/
      // invoice detail, payroll runs, and every `webPersist: "none"` query,
      // so returning to a backgrounded tab left them stale indefinitely.
      const freshness = query.meta?.freshness
      const inScope =
        query.meta?.webPersist === "reduced" ||
        freshness === "critical" ||
        freshness === "operational"
      if (!inScope) return false
      const staleTime = (query.options.staleTime as number | undefined) ?? 30_000
      if (!query.state.dataUpdatedAt) return true
      return Date.now() - query.state.dataUpdatedAt > staleTime
    },
    type: "active",
  })
}

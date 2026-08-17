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
import { apiFetch } from "@/lib/query/api-client"
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

export function readWalletListInitialData(scope: Scope): WalletBalancesData | undefined {
  if (typeof window === "undefined") return undefined
  const storageKey = getWalletListStorageKey(scope)
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as {
      balances?: OnChainBalances
      available?: AvailableCurrencies
      deposits?: DepositAddresses
    }
    if (!parsed?.balances) return undefined
    if (
      parsed.balances.source !== "turnkey" &&
      parsed.balances.source !== "db" &&
      parsed.balances.source !== "realtime"
    ) {
      return undefined
    }
    return {
      balances: parsed.balances ?? {},
      available: parsed.available ?? {},
      deposits: parsed.deposits ?? {},
    }
  } catch {
    return undefined
  }
}

export async function fetchWalletBalances(
  scope: Scope,
  queryClient: QueryClient,
): Promise<WalletBalancesData> {
  const queryKey = qk.wallets.list(scope)
  const [balances, available, deposits] = await Promise.all([
    apiFetch<OnChainBalances>("/api/wallets/on-chain-balances", { headers: ACCOUNT_SCOPE_HEADERS }),
    apiFetch<AvailableCurrencies>("/api/accounts/available-currencies", {
      headers: ACCOUNT_SCOPE_HEADERS,
    }),
    apiFetch<DepositAddresses>("/api/wallets/deposit-addresses", {
      query: { mode: "fast" },
      headers: ACCOUNT_SCOPE_HEADERS,
    }),
  ])
  const detail = String(balances?.detail ?? "")
  const isTransientTurnkeyFailure =
    balances?.source === "none" &&
    (detail === "turnkey_balance_query_failed" || detail.startsWith("turnkey_balance_query_failed:"))
  if (isTransientTurnkeyFailure) {
    const prev = queryClient.getQueryData<WalletBalancesData>(queryKey)
    if (prev) return prev
    throw new Error("Transient Turnkey balance lookup failure")
  }
  const prev = queryClient.getQueryData<WalletBalancesData>(queryKey)
  if (
    isSuspiciousAuthoritativeZeroRegression(
      balances?.source,
      balances?.USD,
      balances?.EUR,
      prev?.balances,
    )
  ) {
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
    initialData: () => readWalletListInitialData(scope),
  }
}

export function incomingBalancesQueryOptions(scope: Scope) {
  return {
    queryKey: [...qk.wallets.root(scope), "incoming-balances"] as const,
    queryFn: async () => {
      const res = await apiFetch<{ balances?: IncomingBalances }>("/api/business/incoming-balances")
      return (res.balances ?? {}) as IncomingBalances
    },
    staleTime: 60_000,
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
  const { payrollOverviewQueryOptions, payrollPeopleQueryOptions } = await import(
    "@/hooks/queries/use-payroll"
  )
  await Promise.allSettled([
    prefetchWorkspaceCriticalData(queryClient, scope),
    queryClient.prefetchQuery(fxRatesPrefetchOptions()),
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
      if (query.meta?.webPersist !== "reduced") return false
      const staleTime = (query.options.staleTime as number | undefined) ?? 30_000
      if (!query.state.dataUpdatedAt) return true
      return Date.now() - query.state.dataUpdatedAt > staleTime
    },
    type: "active",
  })
}

/**
 * Typed TanStack Query key factory.
 *
 * All keys are readonly tuples so TanStack Query's structural sharing and
 * prefix matching work without surprises. Scoped domains are prefixed with
 * `scopeKey(scope)` so invalidating `qk.wallets.root(scope)` matches every
 * wallet-related query for that entity without touching siblings.
 *
 * Never build keys by hand at a call site – always go through `qk.*`.
 */

import { scopeKey, type Scope } from "./scope"

export type ApprovalStatus = "open" | "pending" | "approved" | "rejected"

export type DateRange = {
  readonly from: string | null
  readonly to: string | null
}

/**
 * Free-form filter bag for list queries (transactions, invoices, etc.).
 *
 * Kept permissive on purpose: the shape of a filter object IS the cache
 * identity. Stable `JSON.stringify`-able scalars only – no Dates, no
 * functions, no class instances.
 */
export type QueryFilters = Readonly<Record<string, string | number | boolean | null | undefined | readonly (string | number)[]>>

export type TxFilters = QueryFilters & {
  readonly status?: string
  readonly currency?: string
  readonly search?: string
  readonly from?: string | null
  readonly to?: string | null
  /** API page size; part of list cache identity. Mobile ledger uses one shared limit for Home + Transactions tab. */
  readonly limit?: number
}

export type AuditFilters = QueryFilters

export const qk = {
  auth: {
    root: ["auth"] as const,
    session: () => ["auth", "session"] as const,
    profile: () => ["auth", "profile"] as const,
    permissions: () => ["auth", "permissions"] as const,
  },
  org: {
    root: ["org"] as const,
    list: () => ["org", "list"] as const,
    detail: (orgId: string) => ["org", orgId] as const,
    members: (orgId: string) => ["org", orgId, "members"] as const,
    audit: (orgId: string, filters?: AuditFilters) =>
      ["org", orgId, "audit", filters ?? {}] as const,
  },
  entity: {
    root: (orgId: string) => ["org", orgId, "entity"] as const,
    list: (orgId: string) => ["org", orgId, "entity", "list"] as const,
    detail: (orgId: string, entityId: string) =>
      ["org", orgId, "entity", entityId] as const,
  },
  wallets: {
    root: (scope: Scope) => [...scopeKey(scope), "wallets"] as const,
    list: (scope: Scope) => [...scopeKey(scope), "wallets", "list"] as const,
    virtualAccounts: (scope: Scope, currencies: readonly string[]) =>
      [...scopeKey(scope), "wallets", "virtual-accounts", [...currencies].sort()] as const,
    depositAddresses: (scope: Scope) => [...scopeKey(scope), "wallets", "deposit-addresses"] as const,
    detail: (scope: Scope, walletId: string) =>
      [...scopeKey(scope), "wallets", walletId] as const,
    balance: (scope: Scope, walletId: string) =>
      [...scopeKey(scope), "wallets", walletId, "balance"] as const,
    incoming: (scope: Scope) => [...scopeKey(scope), "wallets", "incoming-balances"] as const,
  },
  transactions: {
    root: (scope: Scope) => [...scopeKey(scope), "transactions"] as const,
    list: (scope: Scope, filters: TxFilters = {}) =>
      [...scopeKey(scope), "transactions", "list", filters] as const,
    summary: (scope: Scope, filters: TxFilters = {}) =>
      [...scopeKey(scope), "transactions", "summary", filters] as const,
    detail: (scope: Scope, txId: string) =>
      [...scopeKey(scope), "transactions", "detail", txId] as const,
  },
  cards: {
    root: (scope: Scope) => [...scopeKey(scope), "cards"] as const,
    list: (scope: Scope) => [...scopeKey(scope), "cards", "list"] as const,
    detail: (scope: Scope, cardId: string) =>
      [...scopeKey(scope), "cards", cardId] as const,
    controls: (scope: Scope, cardId: string) =>
      [...scopeKey(scope), "cards", cardId, "controls"] as const,
  },
  approvals: {
    root: (scope: Scope) => [...scopeKey(scope), "approvals"] as const,
    queue: (scope: Scope, status: ApprovalStatus) =>
      [...scopeKey(scope), "approvals", "queue", status] as const,
  },
  beneficiaries: {
    root: (scope: Scope) => [...scopeKey(scope), "beneficiaries"] as const,
    list: (scope: Scope) => [...scopeKey(scope), "beneficiaries", "list"] as const,
    detail: (scope: Scope, id: string) =>
      [...scopeKey(scope), "beneficiaries", id] as const,
  },
  collections: {
    paymentLinks: {
      root: (scope: Scope) => [...scopeKey(scope), "collections", "payment-links"] as const,
      list: (scope: Scope, filters: QueryFilters = {}) =>
        [...scopeKey(scope), "collections", "payment-links", "list", filters] as const,
    },
    checkoutSettings: {
      root: (scope: Scope) => [...scopeKey(scope), "collections", "checkout-settings"] as const,
      hub: (scope: Scope) => [...scopeKey(scope), "collections", "checkout-settings", "hub"] as const,
      testPayments: (scope: Scope) =>
        [...scopeKey(scope), "collections", "checkout-settings", "test-payments"] as const,
    },
    connectStatus: (scope: Scope) => [...scopeKey(scope), "collections", "connect-status"] as const,
  },
  invoices: {
    root: (scope: Scope) => [...scopeKey(scope), "invoices"] as const,
    list: (scope: Scope, filters: QueryFilters = {}) =>
      [...scopeKey(scope), "invoices", "list", filters] as const,
    detail: (scope: Scope, id: string) =>
      [...scopeKey(scope), "invoices", id] as const,
  },
  payroll: {
    root: (scope: Scope) => [...scopeKey(scope), "payroll"] as const,
    overview: (scope: Scope) => [...scopeKey(scope), "payroll", "overview"] as const,
    people: {
      root: (scope: Scope) => [...scopeKey(scope), "payroll", "people"] as const,
      list: (scope: Scope) => [...scopeKey(scope), "payroll", "people", "list"] as const,
      detail: (scope: Scope, id: string) =>
        [...scopeKey(scope), "payroll", "people", id] as const,
    },
    runs: {
      root: (scope: Scope) => [...scopeKey(scope), "payroll", "runs"] as const,
      list: (scope: Scope) => [...scopeKey(scope), "payroll", "runs", "list"] as const,
      detail: (scope: Scope, id: string) =>
        [...scopeKey(scope), "payroll", "runs", id] as const,
    },
    schedules: {
      root: (scope: Scope) => [...scopeKey(scope), "payroll", "schedules"] as const,
      list: (scope: Scope) => [...scopeKey(scope), "payroll", "schedules", "list"] as const,
    },
  },
  customers: {
    root: (scope: Scope) => [...scopeKey(scope), "customers"] as const,
    list: (scope: Scope) => [...scopeKey(scope), "customers", "list"] as const,
    detail: (scope: Scope, id: string) =>
      [...scopeKey(scope), "customers", id] as const,
  },
  fx: {
    root: ["fx"] as const,
    pairs: () => ["fx", "pairs"] as const,
    quote: (from: string, to: string, amount: string) =>
      ["fx", "quote", from, to, amount] as const,
  },
  treasury: {
    root: (scope: Scope) => [...scopeKey(scope), "treasury"] as const,
    summary: (scope: Scope) => [...scopeKey(scope), "treasury", "summary"] as const,
    cashflow: (scope: Scope, range: DateRange) =>
      [...scopeKey(scope), "treasury", "cashflow", range] as const,
  },
  settings: {
    root: ["settings"] as const,
    communication: (userId: string) =>
      ["settings", "communication", userId] as const,
  },
  verification: {
    root: (scope: Scope) => [...scopeKey(scope), "verification"] as const,
    packet: (scope: Scope) => [...scopeKey(scope), "verification", "packet"] as const,
    expressOnramp: (scope: Scope) => [...scopeKey(scope), "verification", "express-onramp"] as const,
  },
  /** Global (per session) – not scope-prefixed; API resolves user vs business subject. */
  accountRestriction: {
    root: () => ["account-restriction"] as const,
  },
  notifications: {
    root: (userId: string) => ["notifications", userId] as const,
    unread: (userId: string) => ["notifications", userId, "unread"] as const,
  },
  reference: {
    root: ["reference"] as const,
    currencies: () => ["reference", "currencies"] as const,
    countries: () => ["reference", "countries"] as const,
    corridors: () => ["reference", "corridors"] as const,
  },
} as const

export type QueryKeys = typeof qk

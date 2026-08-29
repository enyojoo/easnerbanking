/** TanStack Query keys for Easner Office (admin app). */

export type OfficeCurrencyScope = "fiat" | "rates"

export type OfficeTransactionFilters = {
  provider?: string
  ycMode?: string
  rail?: string
  status?: string
}

export const officeKeys = {
  root: ["office"] as const,
  overview: (preset: string) => [...officeKeys.root, "overview", preset] as const,
  overviewRoot: () => [...officeKeys.root, "overview"] as const,
  users: () => [...officeKeys.root, "users"] as const,
  userTransactions: (userId: string) => [...officeKeys.root, "user-transactions", userId] as const,
  userMfa: (userId: string) => [...officeKeys.root, "user-mfa", userId] as const,
  transactionsRoot: () => [...officeKeys.root, "transactions"] as const,
  transactions: (filters?: OfficeTransactionFilters) =>
    [...officeKeys.root, "transactions", filters ?? {}] as const,
  eventInbox: (provider: string, status: string) =>
    [...officeKeys.root, "event-inbox", provider, status] as const,
  statements: (filters?: { q?: string; currency?: string; scope?: string }) =>
    [...officeKeys.root, "statements", filters ?? {}] as const,
  businessCustomers: () => [...officeKeys.root, "business-customers"] as const,
  businessInvoices: () => [...officeKeys.root, "business-invoices"] as const,
  businesses: () => [...officeKeys.root, "businesses"] as const,
  terminalSessions: () => [...officeKeys.root, "terminal-sessions"] as const,
  currencies: (scope: OfficeCurrencyScope | "all" = "all") =>
    [...officeKeys.root, "currencies", scope] as const,
  noahRates: () => [...officeKeys.root, "noah-rates"] as const,
  ycRates: () => [...officeKeys.root, "yc-rates"] as const,
  gridRates: () => [...officeKeys.root, "grid-rates"] as const,
  cryptoRates: () => [...officeKeys.root, "crypto-rates"] as const,
  payoutCorridors: () => [...officeKeys.root, "payout-corridors"] as const,
  cryptoDestinations: () => [...officeKeys.root, "crypto-destinations"] as const,
  processingFeeSchedule: (scope: string) => [...officeKeys.root, "processing-fee-schedule", scope] as const,
  processingFeeOverride: (subjectType: string, subjectId: string) =>
    [...officeKeys.root, "processing-fee-override", subjectType, subjectId] as const,
  systemSettings: () => [...officeKeys.root, "system-settings"] as const,
} as const

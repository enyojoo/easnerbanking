/** TanStack Query keys for Easner Office (admin app). */

export type OfficeCurrencyScope = "fiat" | "rates"

export const officeKeys = {
  root: ["office"] as const,
  overview: (preset: string) => [...officeKeys.root, "overview", preset] as const,
  users: () => [...officeKeys.root, "users"] as const,
  transactions: () => [...officeKeys.root, "transactions"] as const,
  eventInbox: (provider: string, status: string) =>
    [...officeKeys.root, "event-inbox", provider, status] as const,
  businessCustomers: () => [...officeKeys.root, "business-customers"] as const,
  businessInvoices: () => [...officeKeys.root, "business-invoices"] as const,
  businesses: () => [...officeKeys.root, "businesses"] as const,
  terminalSessions: () => [...officeKeys.root, "terminal-sessions"] as const,
  currencies: (scope: OfficeCurrencyScope | "all" = "all") =>
    [...officeKeys.root, "currencies", scope] as const,
  exchangeRates: () => [...officeKeys.root, "exchange-rates"] as const,
  noahRates: () => [...officeKeys.root, "noah-rates"] as const,
  ycRates: () => [...officeKeys.root, "yc-rates"] as const,
  cryptoRates: () => [...officeKeys.root, "crypto-rates"] as const,
  payoutCorridors: () => [...officeKeys.root, "payout-corridors"] as const,
  cryptoDestinations: () => [...officeKeys.root, "crypto-destinations"] as const,
  systemSettings: () => [...officeKeys.root, "system-settings"] as const,
} as const

/** TanStack Query keys for Easner Office (admin app). */

export const officeKeys = {
  root: ["office"] as const,
  adminData: () => [...officeKeys.root, "admin-data"] as const,
  overview: (preset: string) => [...officeKeys.root, "overview", preset] as const,
  users: () => [...officeKeys.root, "users"] as const,
  transactions: () => [...officeKeys.root, "transactions"] as const,
  eventInbox: (provider: string, status: string) =>
    [...officeKeys.root, "event-inbox", provider, status] as const,
  businessCustomers: () => [...officeKeys.root, "business-customers"] as const,
  businessInvoices: () => [...officeKeys.root, "business-invoices"] as const,
  businesses: () => [...officeKeys.root, "businesses"] as const,
  terminalSessions: () => [...officeKeys.root, "terminal-sessions"] as const,
} as const

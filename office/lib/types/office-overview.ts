/** Response from GET /api/admin/office/overview (via office proxy to business). */
export type OfficeOverviewWindow = {
  preset: string
  since: string
  until: string
}

export type OfficeOverviewKpis = {
  totalUsers: number
  newUsersInWindow: number
  totalBusinesses: number
  newBusinessesInWindow: number
  transactionCount: number
  transactionVolumeUsd: number
  pendingTransactions: number
  activeUsers: number
  verifiedUsers: number
  b2bCustomerCount: number
  invoiceCount: number
  /** All-time count of `terminal_sessions` rows (B2B terminal checkout sessions). */
  terminalSessionCount: number
}

export type OfficeOverviewTopCurrency = {
  code: string
  count: number
  totalAmount: number
}

export type OfficeOverviewProcessingBucket = {
  label: string
  count: number
}

export type OfficeOverviewActivity = {
  id: string
  type: string
  message: string
  time: string
  user?: string
  amount?: string
}

export type OfficeOverviewResponse = {
  window: OfficeOverviewWindow
  kpis: OfficeOverviewKpis
  topCurrencies: OfficeOverviewTopCurrency[]
  processingBuckets: OfficeOverviewProcessingBucket[]
  recentActivity: OfficeOverviewActivity[]
  links: {
    platformHealth: string
    currencies: string
    transactions: string
    platformControl: string
  }
}

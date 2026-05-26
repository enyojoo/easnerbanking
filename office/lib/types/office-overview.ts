/** Response from GET /api/admin/office/overview (via office proxy to business). */
export type OfficeOverviewWindow = {
  preset: string
  since: string
  until: string
}

export type OfficeVolumeBalanceSide = {
  moneyIn: number
  moneyOut: number
  total: number
}

export type OfficeVolumeBalance = {
  USD: OfficeVolumeBalanceSide
  EUR: OfficeVolumeBalanceSide
}

export type OfficeOverviewKpis = {
  totalUsers: number
  newUsersInWindow: number
  totalBusinesses: number
  newBusinessesInWindow: number
  transactionCount: number
  /** @deprecated Prefer `volumeBalance` — USD balance-leg throughput only */
  transactionVolumeUsd: number
  volumeBalance: OfficeVolumeBalance
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
  productLabel?: string
  statusLabel?: string
  time: string
  who?: string
  /** @deprecated Use `who` */
  user?: string
  userKind?: "business" | "individual"
  amount?: string
}

export type OfficeOverviewRecentTransaction = {
  id: string
  easner_transaction_id: string | null
  provider: string
  direction: "in" | "out"
  flowLabel: string
  status: string
  statusLabel: string
  label: string
  who: string
  /** @deprecated Use `who` */
  user: string
  userKind?: "business" | "individual"
  amount: number
  currency: string
  amountFormatted: string
  balanceAmount: number
  balanceCurrency: string | null
  balanceFormatted: string | null
  occurred_at: string | null
}

export type OfficeOverviewResponse = {
  window: OfficeOverviewWindow
  kpis: OfficeOverviewKpis
  topCurrencies: OfficeOverviewTopCurrency[]
  processingBuckets: OfficeOverviewProcessingBucket[]
  recentActivity: OfficeOverviewActivity[]
  recentTransactions: OfficeOverviewRecentTransaction[]
  links: {
    platformHealth: string
    currencies: string
    transactions: string
    platformControl: string
  }
}

export type OfficeEventInboxRow = {
  id: string
  provider: string
  event_id: string
  event_type: string | null
  status: string
  error: string | null
  payload_hash: string | null
  received_at: string
  processed_at: string | null
}

export type OfficeEventInboxResponse = {
  events: OfficeEventInboxRow[]
  counts: {
    received: number
    processed: number
    failed: number
  }
}

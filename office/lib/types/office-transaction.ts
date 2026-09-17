export type OfficeYcMode = "fund_balance" | "cross_border_send" | "balance_payout" | null

export type OfficePayInRail = "bank_transfer" | "mobile_money" | null

export type OfficeVolumeBalanceSide = {
  moneyIn: number
  moneyOut: number
  total: number
}

export type OfficeTransactionsSummary = {
  volumeBalance: {
    USD: OfficeVolumeBalanceSide
    EUR: OfficeVolumeBalanceSide
  }
  ycVolumeBreakdown?: {
    fund_balance: { count: number; usdVolume: number }
    cross_border_send: { count: number; usdVolume: number }
    balance_payout: { count: number; usdVolume: number }
  }
  transactionCount: number
  window?: {
    preset: string
    since: string | null
    until: string | null
  }
}

export const OFFICE_TRANSACTION_PROVIDERS = [
  "yellowcard",
  "noah",
  "grid",
  "bridge",
  "turnkey",
  "stripe",
  "relay",
  "easner_internal",
] as const

export type OfficeTransactionProvider = (typeof OFFICE_TRANSACTION_PROVIDERS)[number]

export type OfficeTransaction = {
  id: string
  user_id?: string | null
  provider?: string | null
  provider_transaction_id?: string | null
  provider_event_id?: string | null
  easner_transaction_id?: string | null
  business_id?: string | null
  status: string
  created_at: string
  occurred_at?: string | null
  settled_at?: string | null
  updated_at?: string
  direction?: "in" | "out" | null
  amount?: number | null
  currency?: string | null
  displayAmount?: number
  displayCurrency?: string
  balanceAmount?: number
  balanceCurrency?: string | null
  balanceFormatted?: string
  impactFormatted?: string
  reportingUsdAmount?: number | null
  reportingEurAmount?: number | null
  productLabel?: string
  ycMode?: OfficeYcMode
  payInRail?: OfficePayInRail
  flowLabel?: "Pay-in" | "Payout"
  label?: string
  amountFormatted?: string
  who?: string
  tx_hash?: string | null
  wallet_address?: string | null
  counterparty_address?: string | null
  asset?: string | null
  chain?: string | null
  hidden_from_feed?: boolean | null
  metadata?: Record<string, unknown> | null
  user?: {
    first_name: string
    last_name: string
    email: string
  }
  business?: {
    id: string
    name: string | null
  } | null
}

export type OfficeCustomerLifecycleStep = {
  id: string
  title: string
  description?: string
  state: string
  occurredAt?: string | null
}

export type OfficeCustomerTimingRow = {
  label: string
  value: string
}

export type OfficeCustomerTransactionDetail = {
  description?: string
  displayHeroTitle?: string | null
  paymentScheme?: string | null
  counterpartyName?: string | null
  sendNote?: string | null
  narration?: string | null
  payoutReview?: Record<string, unknown> | null
  payoutReviewFlow?: string | null
  depositReview?: Record<string, unknown> | null
  inboundReceive?: Record<string, unknown> | null
  recipientSnapshot?: Record<string, unknown> | null
  moveReview?: Record<string, unknown> | null
  lifecycle?: OfficeCustomerLifecycleStep[] | null
  transactionTiming?: OfficeCustomerTimingRow[] | null
  quoteExpiresAt?: string | null
  ycPayInPaymentDetails?: Record<string, unknown> | null
  stripePaymentMethod?: {
    type: string
    brand?: string
    last4?: string
    wallet?: string | null
    bankName?: string
  } | null
  settlementRailLabel?: string | null
  customerName?: string | null
  customerEmail?: string | null
  fee?: number | null
  postedAmount?: number | null
  depositAmount?: number | null
  postedCurrency?: string | null
  chain?: string | null
  walletAddress?: string | null
  counterpartyAddress?: string | null
  receiveNetwork?: string | null
}

export type OfficeTransactionOps = {
  provider: string | null
  providerTransactionId: string | null
  providerEventId: string | null
  easnerTransactionId: string | null
  ledgerId: string
  rawStatus: string
  ycMode: OfficeYcMode
  payInRail: OfficePayInRail
  chain: string | null
  asset: string | null
  txHash: string | null
  walletAddress: string | null
  counterpartyAddress: string | null
  failureReason: string | null
  createdAt: string | null
  occurredAt: string | null
  updatedAt: string | null
  settledAt: string | null
  hiddenFromFeed: boolean
}

export type OfficeTransactionAccount = {
  userId: string | null
  userHref: string | null
  userName: string | null
  userEmail: string | null
  businessId: string | null
  businessHref: string | null
  businessName: string | null
}

export type OfficeRelatedLedgerLeg = {
  id: string
  easner_transaction_id: string | null
  provider: string
  provider_transaction_id: string | null
  status: string
  direction: string | null
  amountFormatted: string
  productLabel: string
  hiddenFromFeed: boolean
  created_at: string
}

export type OfficeTransactionDetail = {
  transaction: OfficeTransaction
  customer: OfficeCustomerTransactionDetail
  ops: OfficeTransactionOps
  account: OfficeTransactionAccount
  related: OfficeRelatedLedgerLeg[]
  metadata: Record<string, unknown> | null
  payload: Record<string, unknown> | null
}

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

export type OfficeTransaction = {
  id: string
  provider?: string | null
  provider_transaction_id?: string | null
  easner_transaction_id?: string | null
  business_id?: string | null
  status: string
  created_at: string
  occurred_at?: string | null
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

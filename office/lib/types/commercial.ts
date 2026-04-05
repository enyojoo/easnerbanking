export type PricingPlan = {
  id: string
  code: string
  name: string
  plan_type: string
  is_active: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type PricingRule = {
  id: string
  plan_id: string | null
  fee_kind: "payin_fee" | "payout_fee" | "fx_markup" | string
  rail: string | null
  country_code: string | null
  source_currency: string | null
  destination_currency: string | null
  user_type: string | null
  kyc_status: string | null
  percent_fee: number | null
  flat_fee: number | null
  markup_bps: number | null
  min_fee: number | null
  max_fee: number | null
  priority: number
  is_active: boolean
  active_from: string | null
  active_to: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  strategy_mode: "maximize_margin" | "maximize_conversion" | "maximize_volume" | "strategic_account_pricing" | null
  min_amount: number | null
  max_amount: number | null
  minimum_net_revenue: number | null
  minimum_margin_bps: number | null
  minimum_margin_percent: number | null
  allow_loss_leader: boolean
  max_total_fee_percent: number | null
  max_total_fee_amount: number | null
  is_small_ticket_protection: boolean
  route_preference: string | null
  competitiveness_tier: string | null
  requires_subscription_tier: string | null
}

export type LimitPolicy = {
  id: string
  plan_id: string | null
  rail: string | null
  currency: string | null
  user_type: string | null
  kyc_status: string | null
  per_tx_limit: number | null
  daily_limit: number | null
  monthly_limit: number | null
  is_active: boolean
  active_from: string | null
  active_to: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type UserSubscription = {
  id: string
  user_id: string
  business_id: string | null
  plan_id: string
  scope: "individual" | "organization" | string
  status: "active" | "paused" | "cancelled" | "expired" | string
  starts_at: string
  ends_at: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  free_payouts_per_period?: number
  fx_markup_discount_bps?: number
  priority_support?: boolean
  rate_lock_seconds?: number
  batch_payout_access?: boolean
  api_access?: boolean
  approval_workflows_enabled?: boolean
  pricing_plans?: {
    code?: string
    name?: string
    plan_type?: string
  } | null
}

export type PromoRule = {
  id: string
  code: string
  name: string
  discount_type: "percentage" | "flat" | "bps" | string
  discount_value: number
  starts_at: string | null
  ends_at: string | null
  usage_limit: number | null
  used_count: number
  is_active: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type RolloutControl = {
  id: string
  name: string
  target_type: "country" | "corridor" | "segment" | "canary" | string
  target_value: string
  is_active: boolean
  starts_at: string | null
  ends_at: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

/** Aggregated provider / pricing quote fields for ops visibility (7d window). */
export type CommercialProviderPricingWindow = {
  quotesWithTotalProviderCost: number
  sumTotalProviderCostOnQuotes: number
  appliedWithTotalProviderCost: number
  sumTotalProviderCostOnApplied: number
  quotesWithPricingTotals: number
  sumTotalUserFeeOnQuotes: number
}

export type CommercialMetrics = {
  window: string
  metrics: {
    grossRevenue: number
    takeRateBps: number
    contributionMarginProxy: number
    failedTransferRate: number
    requoteOrExpiredRate: number
    webhookFailureRate: number
  }
  totals: {
    feesApplied: number
    quotes: number
    transactions: number
    webhookDeliveries: number
  }
  strategy?: {
    strategyModeCounts: Record<string, number>
    repricingReasonCounts: Record<string, number>
    marginByAmountBand?: Record<string, { count: number; netRevenue: number }>
    marginByCorridor?: Record<string, { count: number; netRevenue: number }>
    conversionByStrategyMode?: Record<string, number>
  }
  /** Present when the business metrics API aggregates quote/applied fee rows with provider columns. */
  providerPricing?: CommercialProviderPricingWindow
  alerts?: {
    webhookRetryExhaustionRisk: boolean
    marginCompressionRisk: boolean
    requoteSpikeRisk: boolean
  }
}

export type PricingEngineHealth = {
  ok: boolean
  runtime: {
    legacyMode: boolean
    shadowMode: boolean
    canaryPercent: number
  }
  rollback: {
    enabled: boolean
    switch: string
  }
  rollout: {
    shadowMode: boolean
    canaryPercent: number
    canarySwitch: string
  }
}

export type ProviderFeeComponent =
  | "legacy_combined"
  | "provider_ramp_fee"
  | "provider_funding_fee"
  | "provider_local_payout_fee"
  | string

/** POST body for provider fee schedules (snake_case keys match business admin API). */
export type CreateProviderFeeSchedulePayload = {
  provider?: string
  version: string
  fee_component?: ProviderFeeComponent
  direction?: string | null
  payout_method?: string | null
  country_code?: string | null
  rail?: string | null
  corridor?: string | null
  source_currency?: string | null
  destination_currency?: string | null
  variable_fee_percent?: number
  variable_fee_bps?: number | null
  fixed_fee_amount?: number
  local_rail_fee_amount?: number
  kyc_kyb_fee_amount?: number
  iban_infra_fee_amount?: number
  fee_currency?: string
  percent_fee_base?: string | null
  min_amount?: number | null
  max_amount?: number | null
  active_from?: string | null
  active_to?: string | null
  is_active?: boolean
  metadata?: Record<string, unknown>
}

export type ProviderFeeSchedule = {
  id: string
  provider: string
  version: string
  rail: string | null
  corridor: string | null
  source_currency: string | null
  destination_currency: string | null
  fee_component?: string | null
  direction?: string | null
  payout_method?: string | null
  country_code?: string | null
  variable_fee_percent?: number
  variable_fee_bps?: number | null
  fee_currency?: string | null
  percent_fee_base?: string | null
  min_amount?: number | null
  max_amount?: number | null
  fixed_fee_amount: number
  local_rail_fee_amount: number
  kyc_kyb_fee_amount: number
  iban_infra_fee_amount: number
  active_from: string | null
  active_to: string | null
  is_active: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at?: string
}

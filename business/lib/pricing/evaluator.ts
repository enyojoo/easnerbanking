import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { getStrategyRuntimeConfig, inCanary } from "@/lib/pricing/strategy-config"

type FeeKind = "payin_fee" | "payout_fee" | "fx_markup"
type StrategyMode =
  | "maximize_margin"
  | "maximize_conversion"
  | "maximize_volume"
  | "strategic_account_pricing"

type RepricingReasonCode =
  | "fx_moved"
  | "provider_fee_changed"
  | "route_unavailable"
  | "compliance_status_changed"
  | "subscription_changed"
  | "quote_expired"

type ProviderFeeSchedule = {
  id: string
  provider: string
  version: string
  rail: string | null
  corridor: string | null
  source_currency: string | null
  destination_currency: string | null
  variable_fee_percent: number
  fixed_fee_amount: number
  local_rail_fee_amount: number
  kyc_kyb_fee_amount: number
  iban_infra_fee_amount: number
}

export type QuoteInput = {
  userId: string
  sourceCurrency: string
  destinationCurrency: string
  sourceAmount: number
  rail?: string
  countryCode?: string
  providerRate?: number
  strategyMode?: StrategyMode
  routeType?: "stablecoin" | "fiat" | "mixed"
  routeCandidates?: Array<{
    id: string
    providerCostAmount?: number
    speedScore?: number
    successScore?: number
    routeType?: "stablecoin" | "fiat" | "mixed"
  }>
  providerFeeVersion?: string
  providerFeePercent?: number
  providerFixedFee?: number
  localRailFee?: number
  provider?: string
  corridor?: string
}

type PricingRule = {
  id: string
  plan_id: string | null
  fee_kind: FeeKind
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
  strategy_mode: StrategyMode | null
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

export type QuoteResult = {
  quoteId: string
  expiresAt: string
  providerRate: number
  effectiveRate: number
  destinationAmount: number
  fxMarkupBps: number
  payinFeeAmount: number
  payoutFeeAmount: number
  totalFeeAmount: number
  sourceAmount: number
  sourceCurrency: string
  destinationCurrency: string
  selectedRoute: string
  routeSelectionReason: string
  pricingStrategyMode: StrategyMode
  marginSnapshot: {
    providerCostAmount: number
    easnerRevenueAmount: number
    netRevenueAmount: number
    marginBps: number
    marginPercent: number
  }
  layeredFees: {
    provider_cost: number
    easner_core_transfer_fee: number
    easner_fx_markup: number
    easner_premium_service_fee: number
    easner_subscription_benefit_adjustment: number
  }
}

function nowIso() {
  return new Date().toISOString()
}

function round8(n: number) {
  return Number(n.toFixed(8))
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function applyFeeBounds(value: number, minFee: number | null, maxFee: number | null): number {
  let out = value
  if (minFee != null) out = Math.max(out, Number(minFee))
  if (maxFee != null) out = Math.min(out, Number(maxFee))
  return out
}

function matchesRule(
  rule: PricingRule,
  params: {
    rail?: string
    countryCode?: string
    sourceCurrency: string
    destinationCurrency: string
    userType?: string
    kycStatus?: string
    amount: number
    strategyMode: StrategyMode
  }
): boolean {
  if (rule.rail && rule.rail !== params.rail) return false
  if (rule.country_code && rule.country_code !== params.countryCode) return false
  if (rule.source_currency && rule.source_currency !== params.sourceCurrency) return false
  if (rule.destination_currency && rule.destination_currency !== params.destinationCurrency) return false
  if (rule.user_type && rule.user_type !== params.userType) return false
  if (rule.kyc_status && rule.kyc_status !== params.kycStatus) return false
  if (rule.min_amount != null && params.amount < Number(rule.min_amount)) return false
  if (rule.max_amount != null && params.amount > Number(rule.max_amount)) return false
  if (rule.strategy_mode && rule.strategy_mode !== params.strategyMode) return false
  return true
}

async function fetchRules(): Promise<PricingRule[]> {
  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("pricing_rules")
    .select("id, plan_id, fee_kind, rail, country_code, source_currency, destination_currency, user_type, kyc_status, percent_fee, flat_fee, markup_bps, min_fee, max_fee, priority, strategy_mode, min_amount, max_amount, minimum_net_revenue, minimum_margin_bps, minimum_margin_percent, allow_loss_leader, max_total_fee_percent, max_total_fee_amount, is_small_ticket_protection, route_preference, competitiveness_tier, requires_subscription_tier")
    .eq("is_active", true)
    .or(`active_from.is.null,active_from.lte.${nowIso()}`)
    .or(`active_to.is.null,active_to.gte.${nowIso()}`)
    .order("priority", { ascending: true })

  if (error) throw error
  return (data || []) as PricingRule[]
}

async function fetchUserContext(
  userId: string
): Promise<{
  userType?: string
  kycStatus?: string
  planId?: string
  subscriptionId?: string
  entitlements: {
    freePayoutsPerPeriod: number
    fxMarkupDiscountBps: number
    prioritySupport: boolean
    rateLockSeconds: number
    batchPayoutAccess: boolean
    apiAccess: boolean
    approvalWorkflowsEnabled: boolean
  }
}> {
  const admin = createSupabaseAdmin()
  const { data: userData } = await admin
    .from("users")
    .select("easner_role, noah_kyc_status, noah_kyb_status")
    .eq("id", userId)
    .maybeSingle()

  const { data: subscription } = await admin
    .from("user_subscriptions")
    .select("id, plan_id, free_payouts_per_period, fx_markup_discount_bps, priority_support, rate_lock_seconds, batch_payout_access, api_access, approval_workflows_enabled")
    .eq("user_id", userId)
    .eq("status", "active")
    .or(`ends_at.is.null,ends_at.gte.${nowIso()}`)
    .order("starts_at", { ascending: false })
    .maybeSingle()

  const entitlements = {
    freePayoutsPerPeriod: Number(subscription?.free_payouts_per_period ?? 0),
    fxMarkupDiscountBps: Number(subscription?.fx_markup_discount_bps ?? 0),
    prioritySupport: Boolean(subscription?.priority_support ?? false),
    rateLockSeconds: Number(subscription?.rate_lock_seconds ?? 300),
    batchPayoutAccess: Boolean(subscription?.batch_payout_access ?? false),
    apiAccess: Boolean(subscription?.api_access ?? false),
    approvalWorkflowsEnabled: Boolean(subscription?.approval_workflows_enabled ?? false),
  }

  if (!userData) {
    return {
      planId: subscription?.plan_id as string | undefined,
      subscriptionId: (subscription?.id as string | undefined) ?? undefined,
      entitlements,
    }
  }
  const role = typeof userData.easner_role === "string" ? userData.easner_role : undefined
  const status =
    role === "business"
      ? (userData.noah_kyb_status as string | undefined)
      : (userData.noah_kyc_status as string | undefined)
  return {
    userType: role,
    kycStatus: status,
    planId: subscription?.plan_id as string | undefined,
    subscriptionId: (subscription?.id as string | undefined) ?? undefined,
    entitlements,
  }
}

function resolveStrategyMode(input: QuoteInput, defaultFromRule?: StrategyMode | null): StrategyMode {
  return input.strategyMode ?? defaultFromRule ?? "maximize_margin"
}

function amountBand(amount: number): "0-100" | "100-500" | "500-2500" | "2500+" {
  if (amount <= 100) return "0-100"
  if (amount <= 500) return "100-500"
  if (amount <= 2500) return "500-2500"
  return "2500+"
}

function selectBestRoute(params: {
  strategyMode: StrategyMode
  candidates: QuoteInput["routeCandidates"]
  defaultRoute: string
  effectiveRate: number
  totalFeeAmount: number
  providerCostAmount: number
}): { selectedRoute: string; routeSelectionReason: string } {
  const candidates = params.candidates ?? []
  if (!candidates.length) {
    return {
      selectedRoute: params.defaultRoute,
      routeSelectionReason: "fallback_default_route",
    }
  }

  const weighted = candidates.map((c) => {
    const providerCost = Number(c.providerCostAmount ?? params.providerCostAmount)
    const speed = Number(c.speedScore ?? 0.5)
    const success = Number(c.successScore ?? 0.5)
    const allInPriceScore = 1 / (1 + params.totalFeeAmount)
    const marginScore = Math.max(0, params.totalFeeAmount - providerCost)
    const normalizedMargin = marginScore / (1 + providerCost)

    let score = 0
    if (params.strategyMode === "maximize_margin") {
      score = normalizedMargin * 0.6 + allInPriceScore * 0.1 + speed * 0.15 + success * 0.15
    } else if (params.strategyMode === "maximize_conversion") {
      score = allInPriceScore * 0.55 + speed * 0.2 + success * 0.2 + normalizedMargin * 0.05
    } else if (params.strategyMode === "maximize_volume") {
      score = allInPriceScore * 0.4 + success * 0.25 + speed * 0.2 + normalizedMargin * 0.15
    } else {
      score = success * 0.3 + speed * 0.25 + normalizedMargin * 0.25 + allInPriceScore * 0.2
    }
    return { id: c.id, score, routeType: c.routeType ?? "fiat" }
  })

  weighted.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  const selected = weighted[0]!
  return {
    selectedRoute: selected.id,
    routeSelectionReason: `strategy_${params.strategyMode}_selected`,
  }
}

function computeProviderBaselineCost(input: QuoteInput, sourceAmount: number): number {
  const percentFee = Number(input.providerFeePercent ?? 0)
  const fixedFee = Number(input.providerFixedFee ?? 0)
  const localRailFee = Number(input.localRailFee ?? 0)
  const variableCost = sourceAmount * percentFee
  return round8(variableCost + fixedFee + localRailFee)
}

async function fetchProviderFeeSchedule(params: {
  provider: string
  rail?: string
  corridor?: string
  sourceCurrency: string
  destinationCurrency: string
}): Promise<ProviderFeeSchedule | null> {
  const admin = createSupabaseAdmin()
  const now = nowIso()
  const { data, error } = await admin
    .from("provider_fee_schedules")
    .select("*")
    .eq("provider", params.provider)
    .eq("is_active", true)
    .or(`active_from.is.null,active_from.lte.${now}`)
    .or(`active_to.is.null,active_to.gte.${now}`)
    .order("created_at", { ascending: false })
  if (error) throw error

  const rows = (data || []) as ProviderFeeSchedule[]
  const match = rows.find((r) => {
    if (r.rail && r.rail !== params.rail) return false
    if (r.corridor && r.corridor !== params.corridor) return false
    if (r.source_currency && r.source_currency !== params.sourceCurrency) return false
    if (r.destination_currency && r.destination_currency !== params.destinationCurrency) return false
    return true
  })
  return match ?? null
}

export async function createQuote(input: QuoteInput): Promise<QuoteResult> {
  const admin = createSupabaseAdmin()
  const sourceCurrency = input.sourceCurrency.toUpperCase()
  const destinationCurrency = input.destinationCurrency.toUpperCase()
  const sourceAmount = Number(input.sourceAmount)
  if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) {
    throw new Error("sourceAmount must be > 0")
  }

  const runtime = getStrategyRuntimeConfig()
  const canaryActive = inCanary(input.userId, runtime.canaryPercent)

  const { userType, kycStatus, planId, entitlements } = await fetchUserContext(input.userId)
  const allRules = await fetchRules()
  const rules = allRules.filter((r) => !r.plan_id || (planId && r.plan_id === planId))
  const inferredStrategy = rules.find((r) => r.strategy_mode)?.strategy_mode ?? null
  const strategyMode = runtime.legacyMode
    ? "maximize_margin"
    : resolveStrategyMode(input, inferredStrategy)
  const matchParams = {
    rail: input.rail,
    countryCode: input.countryCode,
    sourceCurrency,
    destinationCurrency,
    userType,
    kycStatus,
    amount: sourceAmount,
    strategyMode,
  }

  const fxRule = rules.find((r) => r.fee_kind === "fx_markup" && matchesRule(r, matchParams))
  const payoutRule = rules.find((r) => r.fee_kind === "payout_fee" && matchesRule(r, matchParams))
  const payinRule = rules.find((r) => r.fee_kind === "payin_fee" && matchesRule(r, matchParams))
  const guardrailRule = rules.find((r) => matchesRule(r, matchParams))

  const provider = input.provider ?? "noah"
  const canonicalSchedule = await fetchProviderFeeSchedule({
    provider,
    rail: input.rail,
    corridor: input.corridor ?? (input.countryCode ? `${input.countryCode}-${destinationCurrency}` : undefined),
    sourceCurrency,
    destinationCurrency,
  })

  const providerRate = input.providerRate && input.providerRate > 0 ? input.providerRate : sourceCurrency === destinationCurrency ? 1 : 1
  const fxMarkupBpsRaw = fxRule?.markup_bps ?? 0
  const corridorAdjustmentBps =
    guardrailRule?.competitiveness_tier === "sensitive"
      ? -25
      : guardrailRule?.competitiveness_tier === "premium"
        ? 25
        : 0
  const routeAdjustmentBps = input.routeType === "stablecoin" ? -15 : 0
  const strategicAdjustmentBps = strategyMode === "strategic_account_pricing" ? -20 : 0
  const userTypeCapBps = userType === "business" ? 250 : 500
  const fxMarkupBpsPreCap =
    fxMarkupBpsRaw +
    corridorAdjustmentBps +
    routeAdjustmentBps +
    strategicAdjustmentBps -
    entitlements.fxMarkupDiscountBps
  const fxMarkupBps = clamp(fxMarkupBpsPreCap, 0, userTypeCapBps)
  const effectiveRate = providerRate * (1 + Number(fxMarkupBps) / 10000)
  const destinationAmount = sourceAmount * effectiveRate

  const payoutRaw = (payoutRule?.flat_fee ?? 0) + sourceAmount * (payoutRule?.percent_fee ?? 0)
  const payinRaw = (payinRule?.flat_fee ?? 0) + sourceAmount * (payinRule?.percent_fee ?? 0)
  const payoutFeeAmount = applyFeeBounds(payoutRaw, payoutRule?.min_fee ?? null, payoutRule?.max_fee ?? null)
  const payinFeeAmount = applyFeeBounds(payinRaw, payinRule?.min_fee ?? null, payinRule?.max_fee ?? null)
  const providerInputForCost: QuoteInput = {
    ...input,
    providerFeePercent:
      canonicalSchedule?.variable_fee_percent ?? input.providerFeePercent ?? 0,
    providerFixedFee:
      canonicalSchedule?.fixed_fee_amount ?? input.providerFixedFee ?? 0,
    localRailFee:
      (canonicalSchedule?.local_rail_fee_amount ?? 0) +
      (canonicalSchedule?.kyc_kyb_fee_amount ?? 0) +
      (canonicalSchedule?.iban_infra_fee_amount ?? 0) +
      (input.localRailFee ?? 0),
  }
  const providerCostAmount = computeProviderBaselineCost(providerInputForCost, sourceAmount)
  const freePayoutBenefit = entitlements.freePayoutsPerPeriod > 0 ? Math.min(payoutFeeAmount, payoutFeeAmount) : 0
  const easnerCoreTransferFee = round8(payoutFeeAmount + payinFeeAmount - freePayoutBenefit)
  const easnerFxMarkupFee = round8(Math.max(0, destinationAmount - sourceAmount * providerRate))
  const easnerPremiumServiceFee = entitlements.prioritySupport ? round8(sourceAmount * 0.0005) : 0
  const subscriptionBenefitAdjustment = round8(-Math.max(0, sourceAmount * (entitlements.fxMarkupDiscountBps / 10000)))
  let totalFeeAmount = round8(easnerCoreTransferFee + easnerPremiumServiceFee + subscriptionBenefitAdjustment)
  const incentiveReasons: string[] = []

  // Behavioral incentives
  if (input.rail === "wallet" || input.rail === "internal_balance") {
    totalFeeAmount = round8(totalFeeAmount * 0.9)
    incentiveReasons.push("internal_balance_pricing_discount")
  }
  if (entitlements.batchPayoutAccess && sourceAmount >= 2500) {
    totalFeeAmount = round8(totalFeeAmount * 0.95)
    incentiveReasons.push("batch_payout_discount")
  }

  // small-ticket protection
  if (sourceAmount <= 300 && (guardrailRule?.is_small_ticket_protection ?? false)) {
    totalFeeAmount = Math.min(totalFeeAmount, round8(sourceAmount * 0.015))
    incentiveReasons.push("small_ticket_protection_applied")
  }

  // fee caps for fairness
  if (guardrailRule?.max_total_fee_amount != null) {
    totalFeeAmount = Math.min(totalFeeAmount, Number(guardrailRule.max_total_fee_amount))
  }
  if (guardrailRule?.max_total_fee_percent != null) {
    totalFeeAmount = Math.min(totalFeeAmount, round8(sourceAmount * Number(guardrailRule.max_total_fee_percent)))
  }

  const easnerRevenueAmount = totalFeeAmount + easnerFxMarkupFee
  const netRevenueAmount = easnerRevenueAmount - providerCostAmount
  const marginBps = sourceAmount > 0 ? round8((netRevenueAmount / sourceAmount) * 10000) : 0
  const marginPercent = sourceAmount > 0 ? round8((netRevenueAmount / sourceAmount) * 100) : 0

  // margin protection
  const allowLossLeader = Boolean(guardrailRule?.allow_loss_leader ?? false)
  if (!allowLossLeader && !runtime.legacyMode && canaryActive) {
    if (
      guardrailRule?.minimum_net_revenue != null &&
      netRevenueAmount < Number(guardrailRule.minimum_net_revenue)
    ) {
      throw new Error("Quote blocked by minimum_net_revenue")
    }
    if (
      guardrailRule?.minimum_margin_bps != null &&
      marginBps < Number(guardrailRule.minimum_margin_bps)
    ) {
      throw new Error("Quote blocked by minimum_margin_bps")
    }
    if (
      guardrailRule?.minimum_margin_percent != null &&
      marginPercent < Number(guardrailRule.minimum_margin_percent)
    ) {
      throw new Error("Quote blocked by minimum_margin_percent")
    }
  }

  const competitivenessBoost =
    guardrailRule?.competitiveness_tier === "sensitive" ? 0.9 : guardrailRule?.competitiveness_tier === "premium" ? 1.1 : 1

  const { selectedRoute, routeSelectionReason } =
    runtime.legacyMode || !canaryActive
      ? {
          selectedRoute: input.routeType ?? "fiat_default",
          routeSelectionReason: runtime.legacyMode ? "legacy_mode_fallback" : "canary_not_selected",
        }
      : selectBestRoute({
          strategyMode,
          candidates: input.routeCandidates,
          defaultRoute: input.routeType ?? "fiat_default",
          effectiveRate,
          totalFeeAmount: round8(totalFeeAmount * competitivenessBoost),
          providerCostAmount,
        })

  const expiresAt = new Date(Date.now() + Math.max(60, entitlements.rateLockSeconds) * 1000).toISOString()
  const quotePayload = {
    ruleIds: {
      fxMarkup: fxRule?.id || null,
      payoutFee: payoutRule?.id || null,
      payinFee: payinRule?.id || null,
    },
    rail: input.rail || null,
    countryCode: input.countryCode || null,
    userType: userType || null,
    kycStatus: kycStatus || null,
    amountBand: amountBand(sourceAmount),
    layeredFees: {
      provider_cost: providerCostAmount,
      easner_core_transfer_fee: easnerCoreTransferFee,
      easner_fx_markup: easnerFxMarkupFee,
      easner_premium_service_fee: easnerPremiumServiceFee,
      easner_subscription_benefit_adjustment: subscriptionBenefitAdjustment,
    },
    subscriptionEntitlements: {
      freePayoutsPerPeriod: entitlements.freePayoutsPerPeriod,
      prioritySupport: entitlements.prioritySupport,
      batchPayoutAccess: entitlements.batchPayoutAccess,
      apiAccess: entitlements.apiAccess,
      approvalWorkflowsEnabled: entitlements.approvalWorkflowsEnabled,
      rateLockSeconds: entitlements.rateLockSeconds,
    },
    strategyMode,
    selectedRoute,
    routeSelectionReason,
    routeType: input.routeType ?? "fiat",
    incentiveReasons,
    runtime: {
      legacyMode: runtime.legacyMode,
      shadowMode: runtime.shadowMode,
      canaryPercent: runtime.canaryPercent,
      canaryActive,
    },
  }

  const { data, error } = await admin
    .from("fee_quotes")
    .insert({
      user_id: input.userId,
      provider: "internal",
      source_currency: sourceCurrency,
      destination_currency: destinationCurrency,
      source_amount: round8(sourceAmount),
      provider_rate: round8(providerRate),
      fx_markup_bps: Number(fxMarkupBps),
      effective_rate: round8(effectiveRate),
      destination_amount: round8(destinationAmount),
      payout_fee_amount: round8(payoutFeeAmount),
      payin_fee_amount: round8(payinFeeAmount),
      total_fee_amount: round8(totalFeeAmount),
      expires_at: expiresAt,
      status: "active",
      quote_payload: quotePayload,
      provider_fee_snapshot: {
        schedule_id: canonicalSchedule?.id || null,
        variable_percent: Number(providerInputForCost.providerFeePercent ?? 0),
        fixed_fee: Number(providerInputForCost.providerFixedFee ?? 0),
        local_rail_fee: Number(providerInputForCost.localRailFee ?? 0),
      },
      provider_fee_version: canonicalSchedule?.version ?? input.providerFeeVersion ?? "v1",
      provider_fee_timestamp: nowIso(),
      fx_timestamp: nowIso(),
      selected_route: selectedRoute,
      route_selection_reason: routeSelectionReason,
      pricing_strategy_mode: strategyMode,
      margin_snapshot: {
        providerCostAmount,
        easnerRevenueAmount,
        netRevenueAmount,
        marginBps,
        marginPercent,
      },
      repricing_reason_code: null,
    })
    .select("id")
    .single()

  if (error || !data) throw error || new Error("Failed to create quote")

  return {
    quoteId: data.id as string,
    expiresAt,
    providerRate: round8(providerRate),
    effectiveRate: round8(effectiveRate),
    destinationAmount: round8(destinationAmount),
    fxMarkupBps: Number(fxMarkupBps),
    payinFeeAmount: round8(payinFeeAmount),
    payoutFeeAmount: round8(payoutFeeAmount),
    totalFeeAmount: round8(totalFeeAmount),
    sourceAmount: round8(sourceAmount),
    sourceCurrency,
    destinationCurrency,
    selectedRoute,
    routeSelectionReason,
    pricingStrategyMode: strategyMode,
    marginSnapshot: {
      providerCostAmount: round8(providerCostAmount),
      easnerRevenueAmount: round8(easnerRevenueAmount),
      netRevenueAmount: round8(netRevenueAmount),
      marginBps: round8(marginBps),
      marginPercent: round8(marginPercent),
    },
    layeredFees: {
      provider_cost: round8(providerCostAmount),
      easner_core_transfer_fee: round8(easnerCoreTransferFee),
      easner_fx_markup: round8(easnerFxMarkupFee),
      easner_premium_service_fee: round8(easnerPremiumServiceFee),
      easner_subscription_benefit_adjustment: round8(subscriptionBenefitAdjustment),
    },
  }
}

export async function validateQuote(userId: string, quoteId: string) {
  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from("fee_quotes")
    .select("*")
    .eq("id", quoteId)
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error("Quote not found")
  if (data.status !== "active") throw new Error("Quote is not active")
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await admin
      .from("fee_quotes")
      .update({
        status: "expired",
        repricing_reason_code: "quote_expired" as RepricingReasonCode,
        updated_at: nowIso(),
      })
      .eq("id", quoteId)
    throw new Error("Quote expired")
  }
  return data
}

export async function applyQuote(params: { userId: string; quoteId: string; transactionId?: string | null }) {
  const admin = createSupabaseAdmin()
  const quote = await validateQuote(params.userId, params.quoteId)

  const { data: applied, error: appliedErr } = await admin
    .from("applied_fees")
    .insert({
      user_id: params.userId,
      quote_id: quote.id,
      transaction_id: params.transactionId || null,
      provider: "internal",
      source_currency: quote.source_currency,
      destination_currency: quote.destination_currency,
      source_amount: quote.source_amount,
      provider_rate: quote.provider_rate,
      fx_markup_bps: quote.fx_markup_bps,
      effective_rate: quote.effective_rate,
      destination_amount: quote.destination_amount,
      payout_fee_amount: quote.payout_fee_amount,
      payin_fee_amount: quote.payin_fee_amount,
      total_fee_amount: quote.total_fee_amount,
      applied_payload: {
        ...(quote.quote_payload || {}),
        provider_fee_snapshot: quote.provider_fee_snapshot || {},
        provider_fee_version: quote.provider_fee_version || null,
        provider_fee_timestamp: quote.provider_fee_timestamp || null,
        fx_timestamp: quote.fx_timestamp || null,
        selected_route: quote.selected_route || null,
        route_selection_reason: quote.route_selection_reason || null,
        pricing_strategy_mode: quote.pricing_strategy_mode || null,
        margin_snapshot: quote.margin_snapshot || {},
      },
    })
    .select("id")
    .single()
  if (appliedErr || !applied) throw appliedErr || new Error("Failed to apply quote")

  const { error: updErr } = await admin
    .from("fee_quotes")
    .update({ status: "used", updated_at: nowIso() })
    .eq("id", quote.id)
  if (updErr) throw updErr

  // Runtime entitlement effect: consume free payout quota usage counter
  const { subscriptionId, entitlements } = await fetchUserContext(params.userId)
  if (subscriptionId && entitlements.freePayoutsPerPeriod > 0) {
    const quotePayload = (quote.quote_payload || {}) as Record<string, unknown>
    const layered = (quotePayload.layeredFees || {}) as Record<string, unknown>
    const transferFee = Number(layered.easner_core_transfer_fee || 0)
    if (transferFee <= 0) {
      const { data: sub } = await admin
        .from("user_subscriptions")
        .select("metadata")
        .eq("id", subscriptionId)
        .maybeSingle()
      const metadata = (sub?.metadata as Record<string, unknown> | null) || {}
      const used = Number(metadata.free_payouts_used ?? 0)
      await admin
        .from("user_subscriptions")
        .update({
          metadata: {
            ...metadata,
            free_payouts_used: used + 1,
            free_payouts_last_used_at: nowIso(),
          },
          updated_at: nowIso(),
        })
        .eq("id", subscriptionId)
    }
  }

  return { appliedFeeId: applied.id as string, quoteId: quote.id as string }
}

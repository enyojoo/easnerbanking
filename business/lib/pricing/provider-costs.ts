/**
 * Noah provider fee decomposition: ramp, funding rail, local payout.
 * Fee amounts are normalized to reporting_currency (default USD). Cross-currency uses
 * `PRICING_FEE_CROSS_RATES_JSON` (see `normalizeFeeToReporting`).
 */

export type ProviderFeeComponentDb =
  | "legacy_combined"
  | "provider_ramp_fee"
  | "provider_funding_fee"
  | "provider_local_payout_fee"

export type FundingDirection = "inbound" | "outbound"

export type PercentFeeBaseDb = "source_amount" | "conversion_notional" | "payout_amount"

export interface ProviderScheduleRow {
  id: string
  provider: string
  version: string
  fee_component?: ProviderFeeComponentDb | null
  rail: string | null
  corridor: string | null
  source_currency: string | null
  destination_currency: string | null
  direction: string | null
  payout_method: string | null
  country_code: string | null
  variable_fee_percent: number | null
  variable_fee_bps: number | null
  fixed_fee_amount: number | null
  local_rail_fee_amount: number | null
  kyc_kyb_fee_amount: number | null
  iban_infra_fee_amount: number | null
  fee_currency: string | null
  percent_fee_base: PercentFeeBaseDb | null
  min_amount: number | null
  max_amount: number | null
}

export interface ProviderCostLine {
  fixed: number
  variable: number
  bps?: number
  currency: string
  base?: PercentFeeBaseDb
  source_schedule_id: string | null
  source_schedule_version: string
  rail?: string | null
  direction?: FundingDirection | null
  country?: string | null
  method?: string | null
}

export interface ProviderCostsBreakdown {
  ramp_fee: ProviderCostLine | null
  funding_fee: ProviderCostLine | null
  funding_fee_outbound: ProviderCostLine | null
  local_payout_fee: ProviderCostLine | null
}

export interface PricingTotals {
  /** Sum of provider components in reporting_currency */
  total_provider_cost: number
  /** Easner revenue from fees + FX markup (what Easner earns on the quote) */
  total_easner_fee: number
  /**
   * All-in user charges in source currency: Easner transfer/premium/subscription fees
   * plus provider pass-through (normalized to source using provider_rate when possible).
   */
  total_user_fee: number
  /** Same as destination_amount — what the recipient receives in destination currency */
  total_recipient_amount: number
  reporting_currency: string
}

export function getReportingCurrency(): string {
  return process.env.PRICING_PROVIDER_COST_REPORTING_CURRENCY?.trim().toUpperCase() || "USD"
}

export function isProviderDecompositionEnabled(): boolean {
  return process.env.PRICING_PROVIDER_DECOMPOSED === "true"
}

/**
 * Convert a fee line amount into `reporting` currency.
 * Same-currency is exact. Cross-currency uses `PRICING_FEE_CROSS_RATES_JSON`:
 * `{ "EUR_USD": 1.08 }` means multiply EUR amount by 1.08 to get USD; `{ "USD_EUR": 0.93 }` is also supported.
 * In production, missing rates throw so margin math cannot silently ignore FX.
 */
function normalizeFeeToReporting(amount: number, feeCurrency: string, reporting: string): number {
  const fc = feeCurrency.toUpperCase()
  const rc = reporting.toUpperCase()
  if (fc === rc) return amount

  const raw = process.env.PRICING_FEE_CROSS_RATES_JSON?.trim()
  if (raw) {
    try {
      const map = JSON.parse(raw) as Record<string, number>
      const direct = map[`${fc}_${rc}`]
      if (typeof direct === "number" && Number.isFinite(direct) && direct > 0) {
        return amount * direct
      }
      const inverse = map[`${rc}_${fc}`]
      if (typeof inverse === "number" && Number.isFinite(inverse) && inverse > 0) {
        return amount / inverse
      }
    } catch {
      // fall through
    }
  }

  const strict =
    process.env.NODE_ENV === "production" || process.env.PRICING_STRICT_FEE_FX === "true"
  if (strict) {
    throw new Error(
      `normalizeFeeToReporting: set PRICING_FEE_CROSS_RATES_JSON for ${fc}→${rc} (e.g. {"${fc}_${rc}": <rate>})`,
    )
  }
  return amount
}

function scheduleMatchesAmount(row: ProviderScheduleRow, amount: number): boolean {
  if (row.min_amount != null && amount < Number(row.min_amount)) return false
  if (row.max_amount != null && amount > Number(row.max_amount)) return false
  return true
}

function getBps(row: ProviderScheduleRow): number {
  if (row.variable_fee_bps != null && Number.isFinite(Number(row.variable_fee_bps))) {
    return Number(row.variable_fee_bps)
  }
  const p = Number(row.variable_fee_percent ?? 0)
  return p * 10000
}

function percentBaseAmount(
  base: PercentFeeBaseDb | null | undefined,
  sourceAmount: number,
  conversionNotional: number,
  payoutAmountDest: number
): number {
  switch (base) {
    case "payout_amount":
      return payoutAmountDest
    case "conversion_notional":
      return conversionNotional
    case "source_amount":
    default:
      return sourceAmount
  }
}

function lineFromSchedule(
  row: ProviderScheduleRow,
  fixed: number,
  variable: number,
  bps: number | undefined,
  base: PercentFeeBaseDb | undefined,
  extras: Partial<ProviderCostLine>
): ProviderCostLine {
  const currency = (row.fee_currency || "USD").toUpperCase()
  return {
    fixed,
    variable,
    bps,
    currency,
    base,
    source_schedule_id: row.id,
    source_schedule_version: String(row.version || "v1"),
    ...extras,
  }
}

function matchCorridor(row: ProviderScheduleRow, corridor: string | undefined): boolean {
  if (!row.corridor) return true
  if (!corridor) return false
  return row.corridor === corridor
}

function matchRail(row: ProviderScheduleRow, rail: string | undefined): boolean {
  if (!row.rail) return true
  if (!rail) return false
  return row.rail.toLowerCase() === rail.toLowerCase()
}

export function findLegacyCombinedSchedule(
  rows: ProviderScheduleRow[],
  params: {
    rail?: string
    corridor?: string
    sourceCurrency: string
    destinationCurrency: string
    sourceAmount: number
  }
): ProviderScheduleRow | null {
  const legacy = rows.filter(
    (r) =>
      (r.fee_component === "legacy_combined" || r.fee_component == null) &&
      scheduleMatchesAmount(r, params.sourceAmount) &&
      matchRail(r, params.rail) &&
      matchCorridor(r, params.corridor) &&
      (!r.source_currency || r.source_currency.toUpperCase() === params.sourceCurrency) &&
      (!r.destination_currency || r.destination_currency.toUpperCase() === params.destinationCurrency)
  )
  return legacy[0] ?? null
}

export function findRampSchedule(
  rows: ProviderScheduleRow[],
  params: {
    rail?: string
    corridor?: string
    sourceCurrency: string
    destinationCurrency: string
    sourceAmount: number
  }
): ProviderScheduleRow | null {
  const candidates = rows.filter(
    (r) =>
      r.fee_component === "provider_ramp_fee" &&
      scheduleMatchesAmount(r, params.sourceAmount) &&
      matchRail(r, params.rail) &&
      matchCorridor(r, params.corridor) &&
      (!r.source_currency || r.source_currency.toUpperCase() === params.sourceCurrency) &&
      (!r.destination_currency || r.destination_currency.toUpperCase() === params.destinationCurrency)
  )
  return candidates[0] ?? null
}

export function findFundingSchedule(
  rows: ProviderScheduleRow[],
  params: {
    rail?: string
    direction: FundingDirection
    sourceCurrency: string
    sourceAmount: number
  }
): ProviderScheduleRow | null {
  if (!params.rail) return null
  const candidates = rows.filter(
    (r) =>
      r.fee_component === "provider_funding_fee" &&
      scheduleMatchesAmount(r, params.sourceAmount) &&
      matchRail(r, params.rail) &&
      r.direction === params.direction &&
      (!r.source_currency || r.source_currency.toUpperCase() === params.sourceCurrency)
  )
  return candidates[0] ?? null
}

export function findLocalPayoutSchedule(
  rows: ProviderScheduleRow[],
  params: {
    countryCode?: string
    payoutMethod?: string
    destinationCurrency: string
    sourceAmount: number
  }
): ProviderScheduleRow | null {
  if (!params.countryCode || !params.payoutMethod) return null
  const cc = params.countryCode.toUpperCase()
  const method = params.payoutMethod.toLowerCase()
  const dest = params.destinationCurrency.toUpperCase()
  const candidates = rows.filter(
    (r) =>
      r.fee_component === "provider_local_payout_fee" &&
      scheduleMatchesAmount(r, params.sourceAmount) &&
      (r.country_code || "").toUpperCase() === cc &&
      (r.payout_method || "").toLowerCase() === method &&
      (!r.destination_currency || r.destination_currency.toUpperCase() === dest)
  )
  return candidates[0] ?? null
}

export function computeRampLine(
  row: ProviderScheduleRow,
  sourceAmount: number,
  conversionNotional: number,
  payoutAmountDest: number
): ProviderCostLine {
  const base = percentBaseAmount(row.percent_fee_base, sourceAmount, conversionNotional, payoutAmountDest)
  const bps = getBps(row)
  const variable = base * (bps / 10000)
  const fixed = Number(row.fixed_fee_amount ?? 0)
  return lineFromSchedule(row, fixed, variable, bps, row.percent_fee_base ?? "source_amount", {
    rail: row.rail,
  })
}

export function computeFundingLine(row: ProviderScheduleRow): ProviderCostLine {
  const fixed =
    Number(row.fixed_fee_amount ?? 0) +
    Number(row.local_rail_fee_amount ?? 0) +
    Number(row.kyc_kyb_fee_amount ?? 0) +
    Number(row.iban_infra_fee_amount ?? 0)
  return lineFromSchedule(row, fixed, 0, undefined, undefined, {
    rail: row.rail,
    direction: (row.direction as FundingDirection) || undefined,
  })
}

export function computeLocalPayoutLine(
  row: ProviderScheduleRow,
  payoutAmountDest: number,
  sourceAmount: number,
  conversionNotional: number
): ProviderCostLine {
  const base = percentBaseAmount(row.percent_fee_base, sourceAmount, conversionNotional, payoutAmountDest)
  const bps = getBps(row)
  const variable = base * (bps / 10000)
  const fixed = Number(row.fixed_fee_amount ?? 0)
  return lineFromSchedule(row, fixed, variable, bps, row.percent_fee_base ?? "payout_amount", {
    country: row.country_code || undefined,
    method: row.payout_method || undefined,
  })
}

/** Full legacy Noah rollup (single schedule row) into one synthetic ramp line for snapshots. */
export function computeLegacyRollupLine(row: ProviderScheduleRow, sourceAmount: number): ProviderCostLine {
  const percentFee = Number(row.variable_fee_percent ?? 0)
  const variable = sourceAmount * percentFee
  const fixed =
    Number(row.fixed_fee_amount ?? 0) +
    Number(row.local_rail_fee_amount ?? 0) +
    Number(row.kyc_kyb_fee_amount ?? 0) +
    Number(row.iban_infra_fee_amount ?? 0)
  const bps = percentFee * 10000
  return lineFromSchedule(row, fixed, variable, bps, "source_amount", {})
}

function lineTotalReporting(line: ProviderCostLine | null, reporting: string): number {
  if (!line) return 0
  return normalizeFeeToReporting(line.fixed + line.variable, line.currency, reporting)
}

export function sumProviderCostsReporting(breakdown: ProviderCostsBreakdown, reporting: string): number {
  return (
    lineTotalReporting(breakdown.ramp_fee, reporting) +
    lineTotalReporting(breakdown.funding_fee, reporting) +
    lineTotalReporting(breakdown.funding_fee_outbound, reporting) +
    lineTotalReporting(breakdown.local_payout_fee, reporting)
  )
}

export function providerCostsToLegacySnapshot(
  breakdown: ProviderCostsBreakdown,
  sourceAmount: number
): {
  schedule_id: string | null
  variable_percent: number
  fixed_fee: number
  local_rail_fee: number
} {
  const reporting = getReportingCurrency()
  const total = sumProviderCostsReporting(breakdown, reporting)
  const variableTotal =
    (breakdown.ramp_fee?.variable ?? 0) +
    (breakdown.local_payout_fee?.variable ?? 0)
  const fixedTotal =
    (breakdown.ramp_fee?.fixed ?? 0) +
    (breakdown.funding_fee?.fixed ?? 0) +
    (breakdown.funding_fee_outbound?.fixed ?? 0) +
    (breakdown.local_payout_fee?.fixed ?? 0)
  const scheduleId =
    breakdown.ramp_fee?.source_schedule_id ||
    breakdown.funding_fee?.source_schedule_id ||
    breakdown.local_payout_fee?.source_schedule_id ||
    null
  return {
    schedule_id: scheduleId,
    variable_percent: sourceAmount > 0 ? variableTotal / sourceAmount : 0,
    fixed_fee: fixedTotal,
    local_rail_fee: 0,
  }
}

export interface DecomposedQuoteParams {
  rows: ProviderScheduleRow[]
  sourceCurrency: string
  destinationCurrency: string
  sourceAmount: number
  destinationAmount: number
  rail?: string
  corridor?: string
  fundingRail?: string
  fundingDirection?: FundingDirection
  fundingRailOutbound?: string
  fundingDirectionOutbound?: FundingDirection
  payoutCountry?: string
  payoutMethod?: string
}

export function buildProviderCostsBreakdown(p: DecomposedQuoteParams): ProviderCostsBreakdown {
  const conversionNotional = p.sourceAmount
  const payoutAmountDest = p.destinationAmount

  const ramp = findRampSchedule(p.rows, {
    rail: p.rail,
    corridor: p.corridor,
    sourceCurrency: p.sourceCurrency,
    destinationCurrency: p.destinationCurrency,
    sourceAmount: p.sourceAmount,
  })
  const fundingIn =
    p.fundingRail && p.fundingDirection
      ? findFundingSchedule(p.rows, {
          rail: p.fundingRail,
          direction: p.fundingDirection,
          sourceCurrency: p.sourceCurrency,
          sourceAmount: p.sourceAmount,
        })
      : null
  const fundingOut =
    p.fundingRailOutbound && p.fundingDirectionOutbound
      ? findFundingSchedule(p.rows, {
          rail: p.fundingRailOutbound,
          direction: p.fundingDirectionOutbound,
          sourceCurrency: p.sourceCurrency,
          sourceAmount: p.sourceAmount,
        })
      : null
  const local = findLocalPayoutSchedule(p.rows, {
    countryCode: p.payoutCountry,
    payoutMethod: p.payoutMethod,
    destinationCurrency: p.destinationCurrency,
    sourceAmount: p.sourceAmount,
  })

  let ramp_fee: ProviderCostLine | null = ramp ? computeRampLine(ramp, p.sourceAmount, conversionNotional, payoutAmountDest) : null
  const funding_fee: ProviderCostLine | null = fundingIn ? computeFundingLine(fundingIn) : null
  const funding_fee_outbound: ProviderCostLine | null = fundingOut ? computeFundingLine(fundingOut) : null
  let local_payout_fee: ProviderCostLine | null = local
    ? computeLocalPayoutLine(local, payoutAmountDest, p.sourceAmount, conversionNotional)
    : null

  const hasComponentRow = Boolean(ramp || fundingIn || fundingOut || local)
  if (!hasComponentRow) {
    const legacy = findLegacyCombinedSchedule(p.rows, {
      rail: p.rail,
      corridor: p.corridor,
      sourceCurrency: p.sourceCurrency,
      destinationCurrency: p.destinationCurrency,
      sourceAmount: p.sourceAmount,
    })
    if (legacy) {
      ramp_fee = computeLegacyRollupLine(legacy, p.sourceAmount)
      local_payout_fee = null
    }
  }

  return {
    ramp_fee,
    funding_fee,
    funding_fee_outbound,
    local_payout_fee,
  }
}

/**
 * Convert provider cost in reporting currency to source currency using provider_rate (dest per 1 source).
 * Used for total_user_fee: pass-through provider share shown to payer in source currency.
 */
export function providerReportingToSourceAmount(
  providerReporting: number,
  reporting: string,
  sourceCurrency: string,
  providerRate: number
): number {
  const rc = reporting.toUpperCase()
  const sc = sourceCurrency.toUpperCase()
  if (rc === sc) return providerReporting
  if (!Number.isFinite(providerRate) || providerRate <= 0) return providerReporting
  return providerReporting / providerRate
}

export function buildPricingTotals(params: {
  totalProviderCostReporting: number
  easnerRevenueAmount: number
  totalFeeAmount: number
  easnerFxMarkupFee: number
  destinationAmount: number
  sourceCurrency: string
  providerRate: number
}): PricingTotals {
  const reporting = getReportingCurrency()
  const providerInSource = providerReportingToSourceAmount(
    params.totalProviderCostReporting,
    reporting,
    params.sourceCurrency,
    params.providerRate
  )
  return {
    total_provider_cost: params.totalProviderCostReporting,
    total_easner_fee: params.easnerRevenueAmount,
    total_user_fee: params.totalFeeAmount + providerInSource,
    total_recipient_amount: params.destinationAmount,
    reporting_currency: reporting,
  }
}

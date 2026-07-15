import type { SupabaseClient } from "@supabase/supabase-js"
import { defaultCurrencyMeta } from "@/lib/admin/currency-catalog-defaults"
import {
  isReportingFxCurrencyCode,
  isReportingFxPair,
  REPORTING_FX_CURRENCY_CODES,
  reportingFxDirectedPairs,
} from "@/lib/fx/reporting-fx"

export type ExchangeRateUpsertRow = {
  from_currency: string
  to_currency: string
  rate: number
  fee_type: "free" | "fixed" | "percentage"
  fee_amount: number
  min_amount?: number | null
  max_amount?: number | null
  status?: string
}

export type CurrencyInsertRow = {
  code: string
  name: string
  symbol: string
  flag_svg?: string | null
  status?: string
  can_send?: boolean
  can_receive?: boolean
}

function assertReportingFxPair(from: string, to: string) {
  const f = from.trim().toUpperCase()
  const t = to.trim().toUpperCase()
  if (!isReportingFxPair(f, t)) {
    throw new Error(`Invalid reporting FX pair: ${f} → ${t}`)
  }
  return { from: f, to: t }
}

export async function listReportingFxRatesAdmin(admin: SupabaseClient) {
  const codes = [...REPORTING_FX_CURRENCY_CODES]
  const { data, error } = await admin
    .from("exchange_rates")
    .select("*")
    .in("from_currency", codes)
    .in("to_currency", codes)
    .order("from_currency")
    .order("to_currency")
  if (error) throw error
  return (data ?? []).filter((r) =>
    isReportingFxPair(String(r.from_currency ?? ""), String(r.to_currency ?? "")),
  )
}

/** @deprecated Use listReportingFxRatesAdmin */
export async function listExchangeRatesAdmin(admin: SupabaseClient) {
  return listReportingFxRatesAdmin(admin)
}

export async function upsertExchangeRatesAdmin(
  admin: SupabaseClient,
  rows: ExchangeRateUpsertRow[],
) {
  const now = new Date().toISOString()
  const payload = rows.map((row) => {
    const { from, to } = assertReportingFxPair(row.from_currency, row.to_currency)
    return {
      from_currency: from,
      to_currency: to,
      rate: Number(row.rate) || 0,
      fee_type: "free" as const,
      fee_amount: 0,
      min_amount: null,
      max_amount: null,
      status: row.status ?? "active",
      source: "office",
      as_of: now,
      updated_at: now,
    }
  })

  if (payload.length === 0) return

  const { error } = await admin.from("exchange_rates").upsert(payload, {
    onConflict: "from_currency,to_currency",
  })
  if (error) throw error
}

/** Ensure currency rows + exchange-rate matrix exist for reporting base currencies. */
export async function ensureReportingFxMatrix(admin: SupabaseClient): Promise<number> {
  const now = new Date().toISOString()
  let inserted = 0

  const currencyPayload = REPORTING_FX_CURRENCY_CODES.map((code) => {
    const meta = defaultCurrencyMeta(code)
    return {
      code,
      name: meta.name,
      symbol: meta.symbol,
      can_send: true,
      can_receive: true,
      status: "active",
      updated_at: now,
    }
  })

  const { error: curErr } = await admin.from("currencies").upsert(currencyPayload, {
    onConflict: "code",
  })
  if (curErr) throw curErr

  const { data: existingRates, error: ratesErr } = await admin
    .from("exchange_rates")
    .select("from_currency, to_currency")
    .in("from_currency", [...REPORTING_FX_CURRENCY_CODES])
    .in("to_currency", [...REPORTING_FX_CURRENCY_CODES])
  if (ratesErr) throw ratesErr

  const have = new Set(
    (existingRates ?? []).map(
      (r) => `${String(r.from_currency ?? "").toUpperCase()}_${String(r.to_currency ?? "").toUpperCase()}`,
    ),
  )

  const missing = reportingFxDirectedPairs().filter(({ from, to }) => !have.has(`${from}_${to}`))
  if (missing.length === 0) return 0

  const bootstrap = missing.map(({ from, to }) => ({
    from_currency: from,
    to_currency: to,
    rate: 1,
    fee_type: "free" as const,
    fee_amount: 0,
    min_amount: null,
    max_amount: null,
    status: "active",
    source: "reporting_fx_bootstrap",
    as_of: now,
    updated_at: now,
  }))

  const { error: insertErr } = await admin.from("exchange_rates").insert(bootstrap)
  if (insertErr) throw insertErr
  inserted = bootstrap.length
  return inserted
}

/** Map Ciuna / legacy row shape → Easner `exchange_rates` upsert payload. */
export function mapLegacyExchangeRateRow(row: {
  from_currency: string
  to_currency: string
  rate: string | number
  fee_type: string
  fee_amount: string | number
  min_amount?: string | number | null
  max_amount?: string | number | null
  status?: string
  updated_at?: string
}): ExchangeRateUpsertRow {
  const feeType = String(row.fee_type ?? "free").toLowerCase()
  const normalizedFeeType =
    feeType === "fixed" || feeType === "percentage" ? feeType : ("free" as const)

  return {
    from_currency: String(row.from_currency).toUpperCase(),
    to_currency: String(row.to_currency).toUpperCase(),
    rate: Number(row.rate) || 0,
    fee_type: normalizedFeeType,
    fee_amount: Number(row.fee_amount) || 0,
    min_amount: row.min_amount == null ? null : Number(row.min_amount),
    max_amount: row.max_amount == null ? null : Number(row.max_amount),
    status: row.status ?? "active",
  }
}

/**
 * Insert missing `currencies` rows for reporting FX codes appearing in `exchange_rates`.
 */
export async function ensureCurrenciesFromExchangeRates(admin: SupabaseClient): Promise<number> {
  const { data: rateRows, error: ratesErr } = await admin
    .from("exchange_rates")
    .select("from_currency, to_currency")
  if (ratesErr) throw ratesErr

  const codes = new Set<string>()
  for (const row of rateRows ?? []) {
    const from = String(row.from_currency ?? "").toUpperCase()
    const to = String(row.to_currency ?? "").toUpperCase()
    if (from && isReportingFxCurrencyCode(from)) codes.add(from)
    if (to && isReportingFxCurrencyCode(to)) codes.add(to)
  }

  if (codes.size === 0) return 0

  const { data: existing, error: curErr } = await admin.from("currencies").select("code")
  if (curErr) throw curErr

  const have = new Set((existing ?? []).map((c) => String(c.code ?? "").toUpperCase()))
  const missing = [...codes].filter((c) => !have.has(c))
  if (missing.length === 0) return 0

  const now = new Date().toISOString()
  const payload = missing.map((code) => {
    const meta = defaultCurrencyMeta(code)
    return {
      code,
      name: meta.name,
      symbol: meta.symbol,
      can_send: true,
      can_receive: true,
      status: "active",
      updated_at: now,
    }
  })

  const { error: insertErr } = await admin.from("currencies").upsert(payload, { onConflict: "code" })
  if (insertErr) throw insertErr
  return missing.length
}

export async function seedExchangeRatesFromLegacyRows(
  admin: SupabaseClient,
  rows: ExchangeRateUpsertRow[],
  opts?: { source?: string },
) {
  const now = new Date().toISOString()
  const source = opts?.source ?? "ciuna_import"
  const payload = rows
    .map((row) => {
      try {
        const { from, to } = assertReportingFxPair(row.from_currency, row.to_currency)
        return {
          from_currency: from,
          to_currency: to,
          rate: Number(row.rate) || 0,
          fee_type: "free" as const,
          fee_amount: 0,
          min_amount: null,
          max_amount: null,
          status: row.status ?? "active",
          source,
          as_of: now,
          updated_at: now,
        }
      } catch {
        return null
      }
    })
    .filter(Boolean) as Record<string, unknown>[]

  const BATCH = 100
  for (let i = 0; i < payload.length; i += BATCH) {
    const batch = payload.slice(i, i + BATCH)
    const { error } = await admin.from("exchange_rates").upsert(batch, {
      onConflict: "from_currency,to_currency",
    })
    if (error) throw error
  }
}

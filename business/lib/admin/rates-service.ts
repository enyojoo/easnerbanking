import type { SupabaseClient } from "@supabase/supabase-js"
import { defaultCurrencyMeta } from "@/lib/admin/currency-catalog-defaults"
import { isOfficeManualRatesCurrencyCode } from "@/lib/admin/office-catalog-currencies"

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

const DEFAULT_MIN = 10
const DEFAULT_MAX = 1_000_000

function assertManualRatesPair(from: string, to: string) {
  const f = from.trim().toUpperCase()
  const t = to.trim().toUpperCase()
  if (!isOfficeManualRatesCurrencyCode(f) || !isOfficeManualRatesCurrencyCode(t)) {
    throw new Error(`Invalid manual rates pair: ${f} → ${t}`)
  }
  return { from: f, to: t }
}

export async function listExchangeRatesAdmin(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("exchange_rates")
    .select("*")
    .order("from_currency")
    .order("to_currency")
  if (error) throw error
  return (data ?? []).filter(
    (r) =>
      isOfficeManualRatesCurrencyCode(String(r.from_currency ?? "")) &&
      isOfficeManualRatesCurrencyCode(String(r.to_currency ?? "")),
  )
}

export async function upsertExchangeRatesAdmin(
  admin: SupabaseClient,
  rows: ExchangeRateUpsertRow[],
) {
  const now = new Date().toISOString()
  const payload = rows.map((row) => {
    const { from, to } = assertManualRatesPair(row.from_currency, row.to_currency)
    return {
      from_currency: from,
      to_currency: to,
      rate: Number(row.rate) || 0,
      fee_type: row.fee_type ?? "free",
      fee_amount: Number(row.fee_amount) || 0,
      min_amount: row.min_amount == null ? null : Number(row.min_amount),
      max_amount: row.max_amount == null ? null : Number(row.max_amount),
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

export async function addCurrencyWithRateMatrix(
  admin: SupabaseClient,
  input: CurrencyInsertRow,
) {
  const code = input.code.trim().toUpperCase()
  if (!isOfficeManualRatesCurrencyCode(code)) {
    throw new Error(`Currency code not allowed on Rates: ${code}`)
  }

  const { data: currency, error: curErr } = await admin
    .from("currencies")
    .insert({
      code,
      name: input.name,
      symbol: input.symbol,
      flag_svg: input.flag_svg ?? null,
      status: input.status ?? "active",
      can_send: input.can_send ?? true,
      can_receive: input.can_receive ?? true,
    })
    .select("*")
    .single()
  if (curErr) throw curErr

  const { data: existing } = await admin.from("currencies").select("code").neq("code", code)
  const others = (existing ?? []).map((c) => String(c.code ?? "").toUpperCase()).filter(Boolean)

  const newRates: ExchangeRateUpsertRow[] = []
  for (const other of others) {
    if (!isOfficeManualRatesCurrencyCode(other)) continue
    newRates.push(
      {
        from_currency: code,
        to_currency: other,
        rate: 1,
        fee_type: "free",
        fee_amount: 0,
        min_amount: DEFAULT_MIN,
        max_amount: DEFAULT_MAX,
        status: "active",
      },
      {
        from_currency: other,
        to_currency: code,
        rate: 1,
        fee_type: "free",
        fee_amount: 0,
        min_amount: DEFAULT_MIN,
        max_amount: DEFAULT_MAX,
        status: "active",
      },
    )
  }

  if (newRates.length > 0) {
    await upsertExchangeRatesAdmin(admin, newRates)
  }

  return currency
}

export async function updateCurrencyAdmin(
  admin: SupabaseClient,
  currencyId: string,
  updates: { can_send?: boolean; can_receive?: boolean; status?: string },
) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof updates.can_send === "boolean") patch.can_send = updates.can_send
  if (typeof updates.can_receive === "boolean") patch.can_receive = updates.can_receive
  if (typeof updates.status === "string") patch.status = updates.status

  const { data, error } = await admin
    .from("currencies")
    .update(patch)
    .eq("id", currencyId)
    .select("*")
    .single()
  if (error) throw error
  return data
}

export async function deleteCurrencyAndRates(admin: SupabaseClient, currencyId: string) {
  const { data: currency, error: findErr } = await admin
    .from("currencies")
    .select("id,code")
    .eq("id", currencyId)
    .maybeSingle()
  if (findErr) throw findErr
  if (!currency) throw new Error("Currency not found")

  const code = String(currency.code ?? "").toUpperCase()

  const { error: ratesErr } = await admin
    .from("exchange_rates")
    .delete()
    .or(`from_currency.eq.${code},to_currency.eq.${code}`)
  if (ratesErr) throw ratesErr

  const { error: delErr } = await admin.from("currencies").delete().eq("id", currencyId)
  if (delErr) throw delErr
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
 * Insert missing `currencies` rows for every code appearing in `exchange_rates`.
 * Safe when rates were seeded before the currencies table existed.
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
    if (from && isOfficeManualRatesCurrencyCode(from)) codes.add(from)
    if (to && isOfficeManualRatesCurrencyCode(to)) codes.add(to)
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
        const { from, to } = assertManualRatesPair(row.from_currency, row.to_currency)
        return {
          from_currency: from,
          to_currency: to,
          rate: Number(row.rate) || 0,
          fee_type: row.fee_type,
          fee_amount: Number(row.fee_amount) || 0,
          min_amount: row.min_amount == null ? null : Number(row.min_amount),
          max_amount: row.max_amount == null ? null : Number(row.max_amount),
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

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  applyNoahCustomerRate,
  easnerBridgeMarginBps,
  NOAH_PAYOUT_MARGIN,
  parseNoahPayoutMarginFromEnv,
} from "@easner/rate-sync"

export type NoahRateUpsertRow = {
  from_currency: string
  to_currency: string
  rate: number
  noah_mid?: number
  margin_bps?: number
  fee_type: "free" | "fixed" | "percentage"
  fee_amount: number
  min_amount?: number | null
  max_amount?: number | null
  status?: string
}

const WALLET_SOURCES = new Set(["USD", "EUR"])

function assertNoahRatesPair(from: string, to: string) {
  const f = from.trim().toUpperCase()
  const t = to.trim().toUpperCase()
  if (!WALLET_SOURCES.has(f)) {
    throw new Error(`Noah rates from_currency must be USD or EUR: ${f}`)
  }
  if (!t || t.length !== 3 || f === t) {
    throw new Error(`Invalid Noah rates pair: ${f} → ${t}`)
  }
  return { from: f, to: t }
}

export async function listNoahRatesAdmin(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("noah_rates")
    .select("*")
    .order("from_currency")
    .order("to_currency")
  if (error) throw error
  return data ?? []
}

export async function upsertNoahRatesAdmin(admin: SupabaseClient, rows: NoahRateUpsertRow[]) {
  const now = new Date().toISOString()
  const defaultMarginBps = easnerBridgeMarginBps(
    parseNoahPayoutMarginFromEnv(process.env.NOAH_PAYOUT_MARGIN),
  )
  const payload = rows.map((row) => {
    const { from, to } = assertNoahRatesPair(row.from_currency, row.to_currency)
    const noahMid =
      row.noah_mid != null && Number.isFinite(row.noah_mid) && row.noah_mid > 0
        ? Number(row.noah_mid)
        : Number(row.rate) || 0
    const rate = Number(row.rate) || 0
    const marginBps =
      row.margin_bps != null && Number.isFinite(row.margin_bps)
        ? Math.round(row.margin_bps)
        : defaultMarginBps
    return {
      from_currency: from,
      to_currency: to,
      noah_mid: noahMid,
      rate,
      margin_bps: marginBps,
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

  const { error } = await admin.from("noah_rates").upsert(payload, {
    onConflict: "from_currency,to_currency",
  })
  if (error) throw error
}

export { applyNoahCustomerRate, easnerBridgeMarginBps, NOAH_PAYOUT_MARGIN }

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  applyYcCustomerBuy,
  applyYcCustomerSell,
  easnerYcMarginBps,
  isYcStoredRatePair,
  parseYcPayoutMarginFromEnv,
  YC_PAYOUT_MARGIN,
} from "@easner/rate-sync"
import { listYcRates, type YcRateRow } from "@/lib/fx/yc-rates"

export type YcRateAdminRow = YcRateRow & {
  updated_at?: string
}

export type YcRateUpsertRow = {
  from_currency: string
  to_currency: string
  rate: number
  yc_buy?: number | null
  yc_sell?: number | null
  margin_bps?: number
  status?: string
}

export async function listYcRatesAdmin(admin: SupabaseClient): Promise<YcRateAdminRow[]> {
  return listYcRates(admin, { status: "all" })
}

export async function upsertYcRatesAdmin(admin: SupabaseClient, rows: YcRateUpsertRow[]) {
  const now = new Date().toISOString()
  const defaultMargin = parseYcPayoutMarginFromEnv(process.env.YC_PAYOUT_MARGIN)
  const defaultMarginBps = easnerYcMarginBps(defaultMargin)

  const payload = rows.map((row) => {
    const from = String(row.from_currency ?? "").trim().toUpperCase()
    const to = String(row.to_currency ?? "").trim().toUpperCase()
    if (!isYcStoredRatePair(from, to)) {
      throw new Error(`Invalid Yellowcard rates pair: ${from} → ${to}`)
    }

    const marginBps =
      row.margin_bps != null && Number.isFinite(row.margin_bps)
        ? Math.round(row.margin_bps)
        : defaultMarginBps
    const margin = marginBps / 10_000

    const ycBuy =
      row.yc_buy != null && Number.isFinite(row.yc_buy) && row.yc_buy > 0
        ? Number(row.yc_buy)
        : null
    const ycSell =
      row.yc_sell != null && Number.isFinite(row.yc_sell) && row.yc_sell > 0
        ? Number(row.yc_sell)
        : null

    let easnerBuy: number | null = null
    let easnerSell: number | null = null
    if (ycBuy != null) easnerBuy = applyYcCustomerBuy(ycBuy, margin)
    if (ycSell != null) easnerSell = applyYcCustomerSell(ycSell, margin)

    let rate = Number(row.rate) || 0
    if (rate <= 0) {
      if (from === "USDC" && easnerSell != null) rate = easnerSell
      else if (easnerBuy != null) rate = easnerBuy
    }

    return {
      from_currency: from,
      to_currency: to,
      yc_buy: ycBuy,
      yc_sell: ycSell,
      easner_buy: easnerBuy,
      easner_sell: easnerSell,
      yc_cross_mid: null,
      rate,
      margin_bps: marginBps,
      source: "office",
      as_of: now,
      updated_at: now,
      status: row.status ?? "active",
    }
  })

  if (payload.length === 0) return

  const { error } = await admin.from("yellowcard_rates").upsert(payload, {
    onConflict: "from_currency,to_currency",
  })
  if (error) throw error
}

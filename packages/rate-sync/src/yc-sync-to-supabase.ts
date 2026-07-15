import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import {
  applyYcCustomerBuy,
  applyYcCustomerCrossRate,
  applyYcCustomerSell,
  easnerYcMarginBps,
  YC_PAYOUT_MARGIN,
} from "./yc-margin"

export type YcCurrencyRateInput = {
  currency: string
  country_code?: string
  yc_buy: number
  yc_sell: number
}

export type YcCrossPairInput = {
  from_currency: string
  to_currency: string
  country_code?: string
}

export type YcRateSyncResult = {
  updated: number
  skipped: number
  pairs: Array<{
    from_currency: string
    to_currency: string
    rate: number
  }>
  skippedPairs: Array<{ from_currency: string; to_currency: string; reason: string }>
}

type ExistingRow = {
  from_currency: string
  to_currency: string
  source: string | null
}

/**
 * Upsert per-currency USDC legs + derived cross pairs into yellowcard_rates.
 * Preserves rows with source = 'office'.
 */
export async function syncYcRatesToSupabase(options: {
  supabaseUrl: string
  serviceRoleKey: string
  currencies: YcCurrencyRateInput[]
  crossPairs?: YcCrossPairInput[]
  dryRun?: boolean
  margin?: number
}): Promise<YcRateSyncResult> {
  const {
    supabaseUrl,
    serviceRoleKey,
    currencies,
    crossPairs = [],
    dryRun,
    margin = YC_PAYOUT_MARGIN,
  } = options
  const supabase: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: existingRows, error: loadError } = await supabase
    .from("yellowcard_rates")
    .select("from_currency,to_currency,source")
  if (loadError) throw loadError

  const existingByKey = new Map<string, ExistingRow>()
  for (const row of existingRows ?? []) {
    const from = String(row.from_currency).toUpperCase()
    const to = String(row.to_currency).toUpperCase()
    existingByKey.set(`${from}_${to}`, row as ExistingRow)
  }

  const nowIso = new Date().toISOString()
  const marginBps = easnerYcMarginBps(margin)
  const updates: Array<Record<string, unknown>> = []
  const skippedPairs: Array<{ from_currency: string; to_currency: string; reason: string }> = []
  const byCcy = new Map<string, { buy: number; sell: number; easnerBuy: number; easnerSell: number }>()

  for (const input of currencies) {
    const ccy = input.currency.trim().toUpperCase()
    if (!ccy || !Number.isFinite(input.yc_buy) || input.yc_buy <= 0 || !Number.isFinite(input.yc_sell) || input.yc_sell <= 0) {
      skippedPairs.push({ from_currency: ccy, to_currency: "USDC", reason: "invalid buy/sell" })
      continue
    }
    const easnerBuy = applyYcCustomerBuy(input.yc_buy, margin)
    const easnerSell = applyYcCustomerSell(input.yc_sell, margin)
    byCcy.set(ccy, {
      buy: input.yc_buy,
      sell: input.yc_sell,
      easnerBuy,
      easnerSell,
    })

    const key = `${ccy}_USDC`
    const existing = existingByKey.get(key)
    const payload: Record<string, unknown> = {
      from_currency: ccy,
      to_currency: "USDC",
      country_code: input.country_code?.trim().toUpperCase() || null,
      yc_buy: Number(input.yc_buy.toPrecision(14)),
      yc_sell: Number(input.yc_sell.toPrecision(14)),
      easner_buy: Number(easnerBuy.toPrecision(14)),
      easner_sell: Number(easnerSell.toPrecision(14)),
      yc_cross_mid: null,
      rate: Number(easnerBuy.toPrecision(14)),
      margin_bps: marginBps,
      source: existing?.source === "office" ? "office" : "yc_rates_sync",
      as_of: nowIso,
      updated_at: nowIso,
      status: "active",
    }
    updates.push(payload)
  }

  for (const pair of crossPairs) {
    const from = pair.from_currency.trim().toUpperCase()
    const to = pair.to_currency.trim().toUpperCase()
    if (!from || !to || from === to) {
      skippedPairs.push({ from_currency: from, to_currency: to, reason: "invalid pair" })
      continue
    }
    const a = byCcy.get(from)
    const b = byCcy.get(to)
    if (!a || !b) {
      skippedPairs.push({ from_currency: from, to_currency: to, reason: "missing currency legs" })
      continue
    }
    const { ycCrossMid, rate } = applyYcCustomerCrossRate(b.buy, a.sell, margin)
    const key = `${from}_${to}`
    const existing = existingByKey.get(key)
    updates.push({
      from_currency: from,
      to_currency: to,
      country_code: pair.country_code?.trim().toUpperCase() || null,
      yc_buy: null,
      yc_sell: null,
      easner_buy: Number(b.easnerBuy.toPrecision(14)),
      easner_sell: Number(a.easnerSell.toPrecision(14)),
      yc_cross_mid: ycCrossMid,
      rate,
      margin_bps: marginBps,
      source: existing?.source === "office" ? "office" : "yc_rates_sync",
      as_of: nowIso,
      updated_at: nowIso,
      status: "active",
    })
  }

  // Deduplicate by unique (from_currency, to_currency) — YC API can return multiple rows per ccy.
  const dedupedByKey = new Map<string, Record<string, unknown>>()
  for (const u of updates) {
    const key = `${String(u.from_currency).toUpperCase()}_${String(u.to_currency).toUpperCase()}`
    dedupedByKey.set(key, u)
  }
  const deduped = [...dedupedByKey.values()]

  if (!dryRun && deduped.length > 0) {
    const { error: upErr } = await supabase.from("yellowcard_rates").upsert(deduped, {
      onConflict: "from_currency,to_currency",
    })
    if (upErr) throw upErr
  }

  return {
    updated: deduped.length,
    skipped: skippedPairs.length,
    pairs: deduped.map((u) => ({
      from_currency: String(u.from_currency),
      to_currency: String(u.to_currency),
      rate: Number(u.rate),
    })),
    skippedPairs,
  }
}

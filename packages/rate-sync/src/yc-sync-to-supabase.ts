import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { isYcStoredRatePairForAllowlist } from "./yc-fiat-currencies"
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
  pruned: number
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

function pushLegRow(
  updates: Array<Record<string, unknown>>,
  existingByKey: Map<string, ExistingRow>,
  nowIso: string,
  marginBps: number,
  row: {
    from_currency: string
    to_currency: string
    country_code?: string | null
    yc_buy?: number | null
    yc_sell?: number | null
    easner_buy?: number | null
    easner_sell?: number | null
    yc_cross_mid?: number | null
    rate: number
  },
) {
  const key = `${row.from_currency}_${row.to_currency}`
  const existing = existingByKey.get(key)
  updates.push({
    from_currency: row.from_currency,
    to_currency: row.to_currency,
    country_code: row.country_code ?? null,
    yc_buy: row.yc_buy ?? null,
    yc_sell: row.yc_sell ?? null,
    easner_buy: row.easner_buy ?? null,
    easner_sell: row.easner_sell ?? null,
    yc_cross_mid: row.yc_cross_mid ?? null,
    rate: row.rate,
    margin_bps: marginBps,
    source: existing?.source === "office" ? "office" : "yc_rates_sync",
    as_of: nowIso,
    updated_at: nowIso,
    status: "active",
  })
}

async function pruneExcludedYcRates(
  supabase: SupabaseClient,
  existingRows: ExistingRow[],
  dryRun?: boolean,
  allowlist?: ReadonlySet<string> | null,
): Promise<number> {
  const toRemove = (existingRows ?? []).filter((row) => {
    if (String(row.source ?? "").toLowerCase() === "office") return false
    const from = String(row.from_currency).toUpperCase()
    const to = String(row.to_currency).toUpperCase()
    return !isYcStoredRatePairForAllowlist(from, to, allowlist)
  })
  if (toRemove.length === 0 || dryRun) return toRemove.length

  for (const row of toRemove) {
    const from = String(row.from_currency).toUpperCase()
    const to = String(row.to_currency).toUpperCase()
    const { error } = await supabase
      .from("yellowcard_rates")
      .delete()
      .eq("from_currency", from)
      .eq("to_currency", to)
    if (error) throw error
  }
  return toRemove.length
}

/**
 * Upsert canonical yellowcard_rates pairs:
 * - USD → local (balance payout, Noah-parity product label)
 * - local → USDC (pay-in / fund balance + cross leg refs)
 * - local → local cross pairs
 * Does not store USDC → local. Preserves rows with source = 'office'.
 */
export async function syncYcRatesToSupabase(options: {
  supabaseUrl: string
  serviceRoleKey: string
  currencies: YcCurrencyRateInput[]
  crossPairs?: YcCrossPairInput[]
  dryRun?: boolean
  margin?: number
  /** Corridor fiat allowlist; when set, prune non-allowlisted pairs. */
  allowlist?: ReadonlySet<string> | string[] | null
}): Promise<YcRateSyncResult> {
  const {
    supabaseUrl,
    serviceRoleKey,
    currencies,
    crossPairs = [],
    dryRun,
    margin = YC_PAYOUT_MARGIN,
    allowlist: allowlistInput,
  } = options
  const allowlist =
    allowlistInput == null
      ? null
      : allowlistInput instanceof Set
        ? allowlistInput
        : new Set([...allowlistInput].map((c) => c.trim().toUpperCase()).filter(Boolean))

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
    if (allowlist && allowlist.size > 0 && !allowlist.has(ccy)) {
      skippedPairs.push({ from_currency: ccy, to_currency: "USDC", reason: "not_in_corridor_allowlist" })
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

    const countryCode = input.country_code?.trim().toUpperCase() || null
    const ycBuy = Number(input.yc_buy.toPrecision(14))
    const ycSell = Number(input.yc_sell.toPrecision(14))
    const easnerBuyPrec = Number(easnerBuy.toPrecision(14))
    const easnerSellPrec = Number(easnerSell.toPrecision(14))

    // Local → USDC (pay-in / fund balance; stores both buy+sell for cross leg refs)
    pushLegRow(updates, existingByKey, nowIso, marginBps, {
      from_currency: ccy,
      to_currency: "USDC",
      country_code: countryCode,
      yc_buy: ycBuy,
      yc_sell: ycSell,
      easner_buy: easnerBuyPrec,
      easner_sell: easnerSellPrec,
      rate: easnerSellPrec,
    })

    // USD → local (balance payout — Noah-parity product label; chain settles USDC 1:1)
    pushLegRow(updates, existingByKey, nowIso, marginBps, {
      from_currency: "USD",
      to_currency: ccy,
      country_code: countryCode,
      yc_buy: ycBuy,
      yc_sell: ycSell,
      easner_buy: easnerBuyPrec,
      easner_sell: easnerSellPrec,
      rate: easnerBuyPrec,
    })
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
    pushLegRow(updates, existingByKey, nowIso, marginBps, {
      from_currency: from,
      to_currency: to,
      country_code: pair.country_code?.trim().toUpperCase() || null,
      easner_buy: Number(b.easnerBuy.toPrecision(14)),
      easner_sell: Number(a.easnerSell.toPrecision(14)),
      yc_cross_mid: ycCrossMid,
      rate,
    })
  }

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

  const pruned = await pruneExcludedYcRates(
    supabase,
    (existingRows ?? []) as ExistingRow[],
    dryRun,
    allowlist,
  )

  return {
    updated: deduped.length,
    skipped: skippedPairs.length,
    pruned,
    pairs: deduped.map((u) => ({
      from_currency: String(u.from_currency),
      to_currency: String(u.to_currency),
      rate: Number(u.rate),
    })),
    skippedPairs,
  }
}

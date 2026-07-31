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
  margin_bps: number | null
}

function resolveEffectiveMarginBps(
  existingByKey: Map<string, ExistingRow>,
  from: string,
  to: string,
  defaultMarginBps: number,
): number {
  const stored = Number(existingByKey.get(`${from}_${to}`)?.margin_bps)
  if (Number.isFinite(stored) && stored >= 0) return Math.round(stored)
  return defaultMarginBps
}

function pushLegRow(
  updates: Array<Record<string, unknown>>,
  existingByKey: Map<string, ExistingRow>,
  nowIso: string,
  defaultMarginBps: number,
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
  const marginBps = resolveEffectiveMarginBps(
    existingByKey,
    row.from_currency,
    row.to_currency,
    defaultMarginBps,
  )
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
    .select("from_currency,to_currency,source,margin_bps")
  if (loadError) throw loadError

  const existingByKey = new Map<string, ExistingRow>()
  for (const row of existingRows ?? []) {
    const from = String(row.from_currency).toUpperCase()
    const to = String(row.to_currency).toUpperCase()
    existingByKey.set(`${from}_${to}`, row as ExistingRow)
  }

  const nowIso = new Date().toISOString()
  const defaultMarginBps = easnerYcMarginBps(margin)
  const updates: Array<Record<string, unknown>> = []
  const skippedPairs: Array<{ from_currency: string; to_currency: string; reason: string }> = []
  const byCcy = new Map<string, { buy: number; sell: number }>()

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
    byCcy.set(ccy, {
      buy: input.yc_buy,
      sell: input.yc_sell,
    })

    const countryCode = input.country_code?.trim().toUpperCase() || null
    const ycBuy = Number(input.yc_buy.toPrecision(14))
    const ycSell = Number(input.yc_sell.toPrecision(14))

    const payInMarginBps = resolveEffectiveMarginBps(existingByKey, ccy, "USDC", defaultMarginBps)
    const payInMargin = payInMarginBps / 10_000
    const easnerSellPrec = Number(applyYcCustomerSell(input.yc_buy, payInMargin).toPrecision(14))
    const easnerBuyForPayIn = Number(applyYcCustomerBuy(input.yc_sell, payInMargin).toPrecision(14))

    pushLegRow(updates, existingByKey, nowIso, defaultMarginBps, {
      from_currency: ccy,
      to_currency: "USDC",
      country_code: countryCode,
      yc_buy: ycBuy,
      yc_sell: ycSell,
      easner_buy: easnerBuyForPayIn,
      easner_sell: easnerSellPrec,
      rate: easnerSellPrec,
    })

    const payoutMarginBps = resolveEffectiveMarginBps(existingByKey, "USD", ccy, defaultMarginBps)
    const payoutMargin = payoutMarginBps / 10_000
    const easnerBuyPrec = Number(applyYcCustomerBuy(input.yc_sell, payoutMargin).toPrecision(14))
    const easnerSellForPayout = Number(applyYcCustomerSell(input.yc_buy, payoutMargin).toPrecision(14))

    pushLegRow(updates, existingByKey, nowIso, defaultMarginBps, {
      from_currency: "USD",
      to_currency: ccy,
      country_code: countryCode,
      yc_buy: ycBuy,
      yc_sell: ycSell,
      easner_buy: easnerBuyPrec,
      easner_sell: easnerSellForPayout,
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
    const crossMarginBps = resolveEffectiveMarginBps(existingByKey, from, to, defaultMarginBps)
    const crossMargin = crossMarginBps / 10_000
    const { ycCrossMid, rate } = applyYcCustomerCrossRate(b.sell, a.buy, crossMargin)
    pushLegRow(updates, existingByKey, nowIso, defaultMarginBps, {
      from_currency: from,
      to_currency: to,
      country_code: pair.country_code?.trim().toUpperCase() || null,
      easner_buy: Number(applyYcCustomerBuy(b.sell, crossMargin).toPrecision(14)),
      easner_sell: Number(applyYcCustomerSell(a.buy, crossMargin).toPrecision(14)),
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

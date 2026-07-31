import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { YcCrossPairInput } from "@easner/rate-sync"
import {
  applyGridCustomerCrossRate,
  applyGridMargin,
  fetchLiveGridExchangeRates,
} from "@/lib/fx/grid-rates"
import {
  buildGridCrossPairsFromFiats,
  loadGridFiatCurrenciesFromSupabase,
} from "@/lib/fx/grid-pair-catalog"
import { getGridPayoutMarginBps } from "@/lib/grid/config"

export type GridRateSyncResult = {
  ok: boolean
  upserted: number
  skipped: number
  error?: string
}

const UPSERT_BATCH_SIZE = 200

function getSupabaseServiceConfig(): { supabaseUrl: string; serviceRoleKey: string } {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("supabase_not_configured")
  }
  return { supabaseUrl, serviceRoleKey }
}

/** Optional override: GRID_CROSS_PAIRS=NGN:KES,NGN:GHS — otherwise all corridor fiats are crossed. */
function resolveGridCrossPairs(fiatCodes: string[]): YcCrossPairInput[] {
  const fromEnv = (process.env.GRID_CROSS_PAIRS || "").trim()
  if (fromEnv) {
    return fromEnv
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const [from, to] = p.split(":").map((s) => s.trim().toUpperCase())
        return { from_currency: from, to_currency: to }
      })
      .filter((p) => p.from_currency && p.to_currency)
  }
  return buildGridCrossPairsFromFiats(fiatCodes)
}

type ExistingGridRateRow = {
  from_currency: string
  to_currency: string
  source: string | null
  margin_bps: number | null
}

function resolveGridMarginBps(
  existingByKey: Map<string, ExistingGridRateRow>,
  from: string,
  to: string,
  defaultMarginBps: number,
): number {
  const stored = Number(existingByKey.get(`${from}_${to}`)?.margin_bps)
  if (Number.isFinite(stored) && stored >= 0) return Math.round(stored)
  return defaultMarginBps
}

type GridRateUpsertPayload = {
  from_currency: string
  to_currency: string
  country_code: string | null
  grid_mid: number
  rate: number
  margin_bps: number
  source: string
  as_of: string
  status: string
  updated_at: string
}

function resolveGridRateSource(
  existingByKey: Map<string, ExistingGridRateRow>,
  from: string,
  to: string,
): string {
  const key = `${from}_${to}`
  return existingByKey.get(key)?.source === "office" ? "office" : "grid_rates_sync"
}

function pushRateRow(
  rowsByKey: Map<string, GridRateUpsertPayload>,
  payload: GridRateUpsertPayload,
): void {
  rowsByKey.set(`${payload.from_currency}_${payload.to_currency}`, payload)
}

async function flushGridRateUpserts(
  admin: SupabaseClient,
  rows: GridRateUpsertPayload[],
): Promise<{ upserted: number; skipped: number }> {
  let upserted = 0
  let skipped = 0
  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE)
    const { error } = await admin.from("grid_rates").upsert(batch, {
      onConflict: "from_currency,to_currency",
    })
    if (error) {
      console.warn("[grid_rates] batch upsert failed", error.message, `batch=${batch.length}`)
      skipped += batch.length
      continue
    }
    upserted += batch.length
  }
  return { upserted, skipped }
}

export async function syncGridExchangeRates(options?: {
  dryRun?: boolean
}): Promise<GridRateSyncResult> {
  const { supabaseUrl, serviceRoleKey } = getSupabaseServiceConfig()
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const defaultMarginBps = getGridPayoutMarginBps()
  const live = await fetchLiveGridExchangeRates()
  if (live.length === 0) {
    return { ok: true, upserted: 0, skipped: 0 }
  }

  const { data: existingRows } = await admin
    .from("grid_rates")
    .select("from_currency,to_currency,source,margin_bps")
  const existingByKey = new Map<string, ExistingGridRateRow>()
  for (const row of existingRows ?? []) {
    const from = String(row.from_currency ?? "").trim().toUpperCase()
    const to = String(row.to_currency ?? "").trim().toUpperCase()
    if (!from || !to) continue
    existingByKey.set(`${from}_${to}`, {
      from_currency: from,
      to_currency: to,
      source: row.source != null ? String(row.source) : null,
      margin_bps: row.margin_bps != null ? Number(row.margin_bps) : null,
    })
  }

  const now = new Date().toISOString()
  const usdPerByFiat = new Map<string, number>()
  const rowsByKey = new Map<string, GridRateUpsertPayload>()
  let skipped = 0

  for (const row of live) {
    const from = row.from.trim().toUpperCase()
    const to = row.to.trim().toUpperCase()
    const marginBps = resolveGridMarginBps(existingByKey, from, to, defaultMarginBps)
    const customerRate = applyGridMargin(row.mid, marginBps)
    pushRateRow(rowsByKey, {
      from_currency: from,
      to_currency: to,
      country_code: row.country ?? null,
      grid_mid: row.mid,
      rate: customerRate,
      margin_bps: marginBps,
      source: resolveGridRateSource(existingByKey, from, to),
      as_of: now,
      status: "active",
      updated_at: now,
    })

    if (from === "USD" && to !== "USD" && row.mid > 0) {
      usdPerByFiat.set(to, row.mid)
      const payInMid = 1 / row.mid
      const payInMarginBps = resolveGridMarginBps(existingByKey, to, "USD", defaultMarginBps)
      pushRateRow(rowsByKey, {
        from_currency: to,
        to_currency: "USD",
        country_code: row.country ?? null,
        grid_mid: payInMid,
        rate: applyGridMargin(payInMid, payInMarginBps),
        margin_bps: payInMarginBps,
        source: resolveGridRateSource(existingByKey, to, "USD"),
        as_of: now,
        status: "active",
        updated_at: now,
      })
    }
  }

  const corridorFiats = await loadGridFiatCurrenciesFromSupabase(admin)
  const apiFiats = [...usdPerByFiat.keys()].sort()
  const fiatsForCross =
    corridorFiats.length > 0 ? apiFiats.filter((f) => corridorFiats.includes(f)) : apiFiats
  const crossPairs = resolveGridCrossPairs(fiatsForCross)

  for (const pair of crossPairs) {
    const from = pair.from_currency.trim().toUpperCase()
    const to = pair.to_currency.trim().toUpperCase()
    if (!from || !to || from === to) {
      skipped++
      continue
    }
    const usdPerFrom = usdPerByFiat.get(from)
    const usdPerTo = usdPerByFiat.get(to)
    if (!usdPerFrom || !usdPerTo) {
      skipped++
      continue
    }

    let gridCrossMid: number
    let rate: number
    const crossMarginBps = resolveGridMarginBps(existingByKey, from, to, defaultMarginBps)
    try {
      ;({ gridCrossMid, rate } = applyGridCustomerCrossRate(usdPerFrom, usdPerTo, crossMarginBps))
    } catch {
      skipped++
      continue
    }

    pushRateRow(rowsByKey, {
      from_currency: from,
      to_currency: to,
      country_code: pair.country_code?.trim().toUpperCase() || null,
      grid_mid: gridCrossMid,
      rate,
      margin_bps: crossMarginBps,
      source: resolveGridRateSource(existingByKey, from, to),
      as_of: now,
      status: "active",
      updated_at: now,
    })
  }

  const payload = [...rowsByKey.values()]
  if (options?.dryRun) {
    return { ok: true, upserted: payload.length, skipped }
  }

  const { upserted, skipped: flushSkipped } = await flushGridRateUpserts(admin, payload)
  return { ok: true, upserted, skipped: skipped + flushSkipped }
}

export async function syncGridRatesSafe(options?: {
  dryRun?: boolean
}): Promise<GridRateSyncResult> {
  try {
    return await syncGridExchangeRates(options)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "grid_rate_sync_failed"
    console.warn("[grid_rates] sync failed:", msg)
    return { ok: false, upserted: 0, skipped: 0, error: msg }
  }
}

import type { SupabaseClient } from "@supabase/supabase-js"
import { isYcStoredRatePair } from "@easner/rate-sync"
import { after } from "next/server"

export type YcRateRow = {
  from_currency: string
  to_currency: string
  country_code: string | null
  yc_buy: number | null
  yc_sell: number | null
  easner_buy: number | null
  easner_sell: number | null
  yc_cross_mid: number | null
  rate: number
  margin_bps: number
  source: string
  as_of: string
  status: string
}

export function getYcRatesRefreshTtlMs(): number {
  const parsed = Number.parseInt(process.env.YC_RATES_REFRESH_TTL_MS || "300000", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 300_000
  return parsed
}

export async function listYcRates(
  admin: SupabaseClient,
  filters?: { destinations?: string[]; status?: string },
): Promise<YcRateRow[]> {
  let q = admin
    .from("yellowcard_rates")
    .select(
      "from_currency,to_currency,country_code,yc_buy,yc_sell,easner_buy,easner_sell,yc_cross_mid,rate,margin_bps,source,as_of,status",
    )

  const status = filters?.status ?? "active"
  if (status !== "all") {
    q = q.eq("status", status)
  }

  const dests = filters?.destinations?.map((d) => d.trim().toUpperCase()).filter(Boolean)
  if (dests?.length) {
    q = q.in("to_currency", dests)
  }

  const { data, error } = await q.order("to_currency").order("from_currency")
  if (error) {
    console.warn("[yellowcard_rates] list:", error.message)
    return []
  }

  return (data ?? [])
    .map((row) => ({
    from_currency: String(row.from_currency ?? "").toUpperCase(),
    to_currency: String(row.to_currency ?? "").toUpperCase(),
    country_code: row.country_code != null ? String(row.country_code).toUpperCase() : null,
    yc_buy: row.yc_buy != null ? Number(row.yc_buy) : null,
    yc_sell: row.yc_sell != null ? Number(row.yc_sell) : null,
    easner_buy: row.easner_buy != null ? Number(row.easner_buy) : null,
    easner_sell: row.easner_sell != null ? Number(row.easner_sell) : null,
    yc_cross_mid: row.yc_cross_mid != null ? Number(row.yc_cross_mid) : null,
    rate: Number(row.rate ?? 0),
    margin_bps: Number(row.margin_bps ?? 0),
    source: String(row.source ?? ""),
    as_of: String(row.as_of ?? new Date().toISOString()),
    status: String(row.status ?? ""),
  }))
    .filter((row) => isYcStoredRatePair(row.from_currency, row.to_currency))
}

export function findYcRate(
  rates: YcRateRow[],
  fromCurrency: string,
  toCurrency: string,
): YcRateRow | null {
  const from = fromCurrency.trim().toUpperCase()
  const to = toCurrency.trim().toUpperCase()
  if (!from || !to) return null
  return (
    rates.find(
      (r) =>
        r.from_currency === from &&
        r.to_currency === to &&
        r.status === "active" &&
        r.rate > 0,
    ) ?? null
  )
}

/** Balance payout: USD → receiveFiat only (Noah-parity product label). */
export function findYcBalancePayoutRate(
  rates: YcRateRow[],
  receiveFiat: string,
): YcRateRow | null {
  const to = receiveFiat.trim().toUpperCase()
  if (!to) return null
  return findYcRate(rates, "USD", to)
}

/**
 * Local pay-in / fund balance leg: localFiat → USDC.
 * Requires easner_sell (customer pay-in rate).
 */
export function findYcPayInLeg(rates: YcRateRow[], localFiat: string): YcRateRow | null {
  const from = localFiat.trim().toUpperCase()
  if (!from) return null
  const row = findYcRate(rates, from, "USDC")
  if (!row?.easner_sell || row.easner_sell <= 0) return null
  return row
}

/** Cross-border customer rate: fromFiat → toFiat. */
export function findYcCrossRate(
  rates: YcRateRow[],
  fromFiat: string,
  toFiat: string,
): YcRateRow | null {
  return findYcRate(rates, fromFiat, toFiat)
}

export function isYcRateFresh(row: YcRateRow, maxAgeMs = getYcRatesRefreshTtlMs()): boolean {
  if (row.status !== "active" || row.rate <= 0) return false
  const asOfMs = new Date(row.as_of).getTime()
  if (!Number.isFinite(asOfMs) || asOfMs <= 0) return false
  return Date.now() - asOfMs <= maxAgeMs
}

export function newestYcRateMs(rates: YcRateRow[]): number {
  return rates.reduce((latest, row) => Math.max(latest, new Date(row.as_of).getTime()), 0)
}

export function areYcRatesFresh(rates: YcRateRow[], maxAgeMs: number): boolean {
  const active = rates.filter((r) => r.status === "active" && r.rate > 0)
  if (active.length === 0) return false
  const newestMs = newestYcRateMs(active)
  return newestMs > 0 && Date.now() - newestMs <= maxAgeMs
}

/**
 * Time-based re-entry guard, NOT a promise latch. Review finding: the prior
 * promise flag was only cleared inside the deferred `after()` callback — a
 * callback dropped on instance freeze (or `after()` throwing outside a
 * request scope) latched it forever, permanently disabling background rate
 * refresh for that warm instance while quotes silently served stale FX.
 * A timestamp self-heals after 60s no matter what happened to the work.
 */
let backgroundSyncStartedAt = 0
const BACKGROUND_SYNC_GUARD_MS = 60_000

export function triggerYcRatesBackgroundRefresh(
  admin: SupabaseClient,
  currentRates: YcRateRow[],
  maxAgeMs = getYcRatesRefreshTtlMs(),
): void {
  if (areYcRatesFresh(currentRates, maxAgeMs)) return
  if (Date.now() - backgroundSyncStartedAt < BACKGROUND_SYNC_GUARD_MS) return
  backgroundSyncStartedAt = Date.now()
  const run = async () => {
    try {
      const { syncYcRatesSafe } = await import("@/lib/fx/yc-rate-sync")
      await syncYcRatesSafe()
    } catch {
      // Best-effort background refresh only.
    } finally {
      backgroundSyncStartedAt = 0
    }
  }
  try {
    // Deferred past the response so the sync never competes with the
    // interactive request it was triggered from.
    after(run)
  } catch {
    // No request scope (scripts, tests, workers): run detached instead.
    void run()
  }
  void admin
}

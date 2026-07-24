import type { SupabaseClient } from "@supabase/supabase-js"
import { listGridExchangeRates, findGridExchangeRate } from "@/lib/grid/discoveries"
import { gridCurrencyCode, gridExchangeRateMid } from "@/lib/grid/types"
import { getGridPayoutMarginBps } from "@/lib/grid/config"

export type GridRateRow = {
  from_currency: string
  to_currency: string
  country_code: string | null
  grid_mid: number
  rate: number
  margin_bps: number
  source: string
  as_of: string
  status: string
}

export function getGridRatesRefreshTtlMs(): number {
  const parsed = Number.parseInt(process.env.GRID_RATES_REFRESH_TTL_MS || "300000", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 300_000
  return parsed
}

export async function listGridRates(
  admin: SupabaseClient,
  filters?: { destinations?: string[]; status?: string },
  options?: { backgroundRefresh?: boolean },
): Promise<GridRateRow[]> {
  let q = admin
    .from("grid_rates")
    .select(
      "from_currency,to_currency,country_code,grid_mid,rate,margin_bps,source,as_of,status",
    )

  const status = filters?.status ?? "active"
  if (status !== "all") {
    q = q.eq("status", status)
  }

  const dests = filters?.destinations?.map((d) => d.trim().toUpperCase()).filter(Boolean)
  if (dests?.length) {
    const orClause = dests
      .flatMap((d) => [`from_currency.eq.${d}`, `to_currency.eq.${d}`])
      .join(",")
    q = q.or(orClause)
  }

  const { data, error } = await q.order("to_currency").order("from_currency")
  if (error) {
    console.warn("[grid_rates] list:", error.message)
    return []
  }

  const rows = (data ?? []).map((row) => ({
    from_currency: String(row.from_currency ?? "").toUpperCase(),
    to_currency: String(row.to_currency ?? "").toUpperCase(),
    country_code: row.country_code != null ? String(row.country_code).toUpperCase() : null,
    grid_mid: Number(row.grid_mid ?? 0),
    rate: Number(row.rate ?? 0),
    margin_bps: Number(row.margin_bps ?? 0),
    source: String(row.source ?? ""),
    as_of: String(row.as_of ?? new Date().toISOString()),
    status: String(row.status ?? ""),
  }))

  if (options?.backgroundRefresh !== false) {
    triggerGridRatesBackgroundRefresh(admin, rows, getGridRatesRefreshTtlMs())
  }

  return rows
}

export function findGridRate(
  rates: GridRateRow[],
  fromCurrency: string,
  toCurrency: string,
): GridRateRow | null {
  const from = fromCurrency.trim().toUpperCase()
  const to = toCurrency.trim().toUpperCase()
  if (!from || !to) return null
  return (
    rates.find(
      (r) =>
        r.from_currency === from &&
        r.to_currency === to &&
        String(r.status).toLowerCase() === "active",
    ) ?? null
  )
}

/** Pay-in leg: local fiat per 1 USD credit (inverts USD→local when needed). */
export function findGridPayInRate(
  rates: GridRateRow[],
  localCurrency: string,
): GridRateRow | null {
  const local = localCurrency.trim().toUpperCase()
  if (!local) return null
  const direct = findGridRate(rates, local, "USD")
  if (direct) return direct
  const inverse = findGridRate(rates, "USD", local)
  if (!inverse?.grid_mid || inverse.grid_mid <= 0) return null
  const payInMid = 1 / inverse.grid_mid
  return {
    ...inverse,
    from_currency: local,
    to_currency: "USD",
    grid_mid: payInMid,
    rate: applyGridMargin(payInMid, inverse.margin_bps),
  }
}

export function applyGridMargin(mid: number, marginBps?: number): number {
  const bps = marginBps ?? getGridPayoutMarginBps()
  if (!Number.isFinite(mid) || mid <= 0) return 0
  return mid * (1 - bps / 10_000)
}

/**
 * Customer cross rate (destination per source) triangulated through USD legs.
 * Each USD→fiat mid is USD per local unit (Grid /exchange-rates shape).
 * Mirrors YC cross: (dest local per USD) / (source local per USD).
 */
export function applyGridCustomerCrossRate(
  usdPerSource: number,
  usdPerDest: number,
  marginBps?: number,
): { gridCrossMid: number; rate: number } {
  if (!Number.isFinite(usdPerSource) || usdPerSource <= 0) {
    throw new Error("usdPerSource must be positive")
  }
  if (!Number.isFinite(usdPerDest) || usdPerDest <= 0) {
    throw new Error("usdPerDest must be positive")
  }
  const gridCrossMid = Number((usdPerSource / usdPerDest).toPrecision(14))
  return { gridCrossMid, rate: applyGridMargin(gridCrossMid, marginBps) }
}

/** Cross-border customer rate: fromFiat → toFiat. */
export function findGridCrossRate(
  rates: GridRateRow[],
  fromFiat: string,
  toFiat: string,
): GridRateRow | null {
  return findGridRate(rates, fromFiat, toFiat)
}

export function isGridRateFresh(row: GridRateRow, maxAgeMs = getGridRatesRefreshTtlMs()): boolean {
  if (row.status !== "active" || row.rate <= 0) return false
  const asOfMs = new Date(row.as_of).getTime()
  if (!Number.isFinite(asOfMs) || asOfMs <= 0) return false
  return Date.now() - asOfMs <= maxAgeMs
}

export function newestGridRateMs(rates: GridRateRow[]): number {
  return rates.reduce((latest, row) => Math.max(latest, new Date(row.as_of).getTime()), 0)
}

export function areGridRatesFresh(rates: GridRateRow[], maxAgeMs: number): boolean {
  const active = rates.filter((r) => r.status === "active" && r.rate > 0)
  if (active.length === 0) return false
  const newestMs = newestGridRateMs(active)
  return newestMs > 0 && Date.now() - newestMs <= maxAgeMs
}

let backgroundSyncInFlight: Promise<void> | null = null

export function triggerGridRatesBackgroundRefresh(
  admin: SupabaseClient,
  currentRates: GridRateRow[],
  maxAgeMs = getGridRatesRefreshTtlMs(),
): void {
  if (areGridRatesFresh(currentRates, maxAgeMs)) return
  if (backgroundSyncInFlight) return
  backgroundSyncInFlight = (async () => {
    try {
      const { syncGridRatesSafe } = await import("@/lib/fx/grid-rate-sync")
      await syncGridRatesSafe()
    } catch {
      // Best-effort
    } finally {
      backgroundSyncInFlight = null
    }
  })()
  void admin
}

/** Indicative USD→local payout rate with Easner margin. */
export function findGridBalancePayoutRate(
  rates: GridRateRow[],
  receiveCurrency: string,
): GridRateRow | null {
  const row = findGridRate(rates, "USD", receiveCurrency)
  if (!row) return null
  return {
    ...row,
    rate: applyGridMargin(row.grid_mid || row.rate, row.margin_bps),
  }
}

export async function fetchLiveGridExchangeRates(): Promise<
  Array<{ from: string; to: string; mid: number; country?: string }>
> {
  const raw = await listGridExchangeRates()
  return raw
    .map((r) => ({
      from: gridCurrencyCode(r.sourceCurrency),
      to: gridCurrencyCode(r.destinationCurrency),
      mid: gridExchangeRateMid(r),
      country: r.country ? String(r.country).toUpperCase() : undefined,
    }))
    .filter((r) => r.from && r.to && r.mid > 0)
}

export { findGridExchangeRate, listGridExchangeRates }

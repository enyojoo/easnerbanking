import type { SupabaseClient } from "@supabase/supabase-js"

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

  return (data ?? []).map((row) => ({
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

let backgroundSyncInFlight: Promise<void> | null = null

export function triggerYcRatesBackgroundRefresh(
  admin: SupabaseClient,
  currentRates: YcRateRow[],
  maxAgeMs = getYcRatesRefreshTtlMs(),
): void {
  if (areYcRatesFresh(currentRates, maxAgeMs)) return
  if (backgroundSyncInFlight) return
  backgroundSyncInFlight = (async () => {
    try {
      const { syncYcRatesSafe } = await import("@/lib/fx/yc-rate-sync")
      await syncYcRatesSafe()
    } catch {
      // Best-effort
    } finally {
      backgroundSyncInFlight = null
    }
  })()
  void admin
}

import type { SupabaseClient } from "@supabase/supabase-js"
import { after } from "next/server"

export type NoahRateRow = {
  from_currency: string
  to_currency: string
  country_code: string | null
  noah_mid: number
  rate: number
  margin_bps: number
  source: string
  as_of: string
  fee_type: string
  fee_amount: number
  min_amount: number | null
  max_amount: number | null
  status: string
}

export function getNoahRatesRefreshTtlMs(): number {
  const parsed = Number.parseInt(process.env.NOAH_RATES_REFRESH_TTL_MS || "300000", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 300_000
  return parsed
}

export async function listNoahRates(
  admin: SupabaseClient,
  filters?: { destinations?: string[]; status?: string },
): Promise<NoahRateRow[]> {
  let q = admin
    .from("noah_rates")
    .select(
      "from_currency,to_currency,country_code,noah_mid,rate,margin_bps,source,as_of,fee_type,fee_amount,min_amount,max_amount,status",
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
    console.warn("[noah_rates] list:", error.message)
    return []
  }

  return (data ?? []).map((row) => ({
    from_currency: String(row.from_currency ?? "").toUpperCase(),
    to_currency: String(row.to_currency ?? "").toUpperCase(),
    country_code: row.country_code != null ? String(row.country_code).toUpperCase() : null,
    noah_mid: Number(row.noah_mid ?? 0),
    rate: Number(row.rate ?? 0),
    margin_bps: Number(row.margin_bps ?? 0),
    source: String(row.source ?? ""),
    as_of: String(row.as_of ?? new Date().toISOString()),
    fee_type: String(row.fee_type ?? "free"),
    fee_amount: Number(row.fee_amount ?? 0),
    min_amount: row.min_amount != null ? Number(row.min_amount) : null,
    max_amount: row.max_amount != null ? Number(row.max_amount) : null,
    status: String(row.status ?? ""),
  }))
}

export function findNoahRate(
  rates: NoahRateRow[],
  fromCurrency: string,
  toCurrency: string,
): NoahRateRow | null {
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

export function isNoahRateFresh(row: NoahRateRow, maxAgeMs = getNoahRatesRefreshTtlMs()): boolean {
  if (row.status !== "active" || row.rate <= 0 || row.noah_mid <= 0) return false
  const asOfMs = new Date(row.as_of).getTime()
  if (!Number.isFinite(asOfMs) || asOfMs <= 0) return false
  return Date.now() - asOfMs <= maxAgeMs
}

export function newestNoahRateMs(rates: NoahRateRow[]): number {
  return rates.reduce((latest, row) => Math.max(latest, new Date(row.as_of).getTime()), 0)
}

export function areNoahRatesFresh(rates: NoahRateRow[], maxAgeMs: number): boolean {
  const active = rates.filter((r) => r.status === "active" && r.rate > 0)
  if (active.length === 0) return false
  const newestMs = newestNoahRateMs(active)
  return newestMs > 0 && Date.now() - newestMs <= maxAgeMs
}

let backgroundSyncInFlight: Promise<void> | null = null

export function triggerNoahRatesBackgroundRefresh(
  admin: SupabaseClient,
  currentRates: NoahRateRow[],
  maxAgeMs = getNoahRatesRefreshTtlMs(),
): void {
  if (areNoahRatesFresh(currentRates, maxAgeMs)) return
  if (backgroundSyncInFlight) return
  // Deferred via after(): the sync is a full provider rate pull + DB writes.
  // Launching it inline inside an interactive quote request made it compete
  // with the request and risked being killed mid-write at response end.
  backgroundSyncInFlight = new Promise<void>((resolve) => {
    after(async () => {
      try {
        const { syncNoahRatesSafe } = await import("@/lib/fx/noah-rate-sync")
        await syncNoahRatesSafe()
      } catch {
        // Best-effort background refresh only.
      } finally {
        backgroundSyncInFlight = null
        resolve()
      }
    })
  })
}

export async function ensureNoahRatesFresh(admin: SupabaseClient): Promise<NoahRateRow[]> {
  const current = await listNoahRates(admin)
  if (areNoahRatesFresh(current, getNoahRatesRefreshTtlMs())) {
    return current
  }
  const { syncNoahRatesSafe } = await import("@/lib/fx/noah-rate-sync")
  const synced = await syncNoahRatesSafe()
  if (!synced.ok) return current
  return listNoahRates(admin)
}

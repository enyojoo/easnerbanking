import type { SupabaseClient } from "@supabase/supabase-js"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"

export type ExchangeRateRow = {
  from_currency: string
  to_currency: string
  rate: number
  as_of: string
}

type OpenExchangeRatesLatestResponse = {
  timestamp?: number
  rates?: Record<string, number>
}

export function assertFxSyncAuthorized(request: Request): void {
  assertInternalCronAuthorized(request)
}

function getOxrAppId(): string {
  return (process.env.OPEN_EXCHANGE_RATES_APP_ID || "").trim()
}

function getOxrBaseUrl(): string {
  return (process.env.OPEN_EXCHANGE_RATES_BASE_URL || "https://openexchangerates.org/api").replace(/\/$/, "")
}

export function isOpenExchangeRatesConfigured(): boolean {
  return Boolean(getOxrAppId())
}

export function getFxRefreshTtlMs(): number {
  // Default to daily refresh; can be overridden via env if needed.
  const parsed = Number.parseInt(process.env.OPEN_EXCHANGE_RATES_TTL_MS || "86400000", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 86_400_000
  return parsed
}

export async function listExchangeRates(admin: SupabaseClient): Promise<ExchangeRateRow[]> {
  const { data, error } = await admin
    .from("exchange_rates")
    .select("from_currency,to_currency,rate,as_of")
    .eq("status", "active")

  if (error) {
    console.warn("[exchange_rates] list:", error.message)
    return []
  }

  return (data ?? []).map((row) => ({
    from_currency: String(row.from_currency ?? "").toUpperCase(),
    to_currency: String(row.to_currency ?? "").toUpperCase(),
    rate: Number(row.rate ?? 0),
    as_of: String(row.as_of ?? new Date().toISOString()),
  }))
}

function newestExchangeRateMs(rates: ExchangeRateRow[]): number {
  return rates.reduce((latest, row) => Math.max(latest, new Date(row.as_of).getTime()), 0)
}

function areExchangeRatesFresh(rates: ExchangeRateRow[], maxAgeMs: number): boolean {
  const newestMs = newestExchangeRateMs(rates)
  return newestMs > 0 && Date.now() - newestMs <= maxAgeMs
}

let backgroundSyncInFlight: Promise<void> | null = null

/**
 * Fire-and-forget refresh for request paths that should return cached DB rows
 * immediately while opportunistically refreshing stale rates in the background.
 */
export function triggerExchangeRatesBackgroundRefresh(
  admin: SupabaseClient,
  currentRates: ExchangeRateRow[],
  maxAgeMs = getFxRefreshTtlMs(),
): void {
  if (areExchangeRatesFresh(currentRates, maxAgeMs)) return
  if (backgroundSyncInFlight) return
  backgroundSyncInFlight = (async () => {
    try {
      await syncOpenExchangeRates(admin)
    } catch {
      // Best-effort background refresh only.
    } finally {
      backgroundSyncInFlight = null
    }
  })()
}

export async function syncOpenExchangeRates(
  admin: SupabaseClient,
): Promise<{ ok: true; asOf: string; updated: number } | { ok: false; reason: string }> {
  if (!isOpenExchangeRatesConfigured()) {
    return { ok: false, reason: "open_exchange_rates_not_configured" }
  }

  const url = new URL(`${getOxrBaseUrl()}/latest.json`)
  url.searchParams.set("app_id", getOxrAppId())
  url.searchParams.set("symbols", "USD,EUR")
  url.searchParams.set("show_alternative", "false")

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  })
  if (!res.ok) {
    return { ok: false, reason: `open_exchange_rates_http_${res.status}` }
  }

  const body = (await res.json()) as OpenExchangeRatesLatestResponse
  const usd = Number(body.rates?.USD ?? 1)
  const eur = Number(body.rates?.EUR ?? Number.NaN)
  if (!Number.isFinite(usd) || usd <= 0 || !Number.isFinite(eur) || eur <= 0) {
    return { ok: false, reason: "open_exchange_rates_invalid_payload" }
  }

  const asOf = new Date((body.timestamp ?? Math.floor(Date.now() / 1000)) * 1000).toISOString()
  const nowIso = new Date().toISOString()
  /** Rate-only upsert — do not overwrite admin fee/limit columns. */
  const updates = [
    {
      from_currency: "USD",
      to_currency: "EUR",
      rate: eur,
      source: "open_exchange_rates",
      as_of: asOf,
      updated_at: nowIso,
    },
    {
      from_currency: "EUR",
      to_currency: "USD",
      rate: 1 / eur,
      source: "open_exchange_rates",
      as_of: asOf,
      updated_at: nowIso,
    },
  ]

  const deduped = Array.from(
    new Map(updates.map((row) => [`${row.from_currency}:${row.to_currency}`, row])).values(),
  )

  const { error } = await admin.from("exchange_rates").upsert(deduped, {
    onConflict: "from_currency,to_currency",
    ignoreDuplicates: false,
  })
  if (error) {
    return { ok: false, reason: error.message }
  }

  return { ok: true, asOf, updated: deduped.length }
}

export function findExchangeRate(
  rates: ExchangeRateRow[],
  fromCurrency: string,
  toCurrency: string,
): { rate: number; asOf: string } | null {
  const from = fromCurrency.trim().toUpperCase()
  const to = toCurrency.trim().toUpperCase()
  if (!from || !to) return null
  if (from === to) return { rate: 1, asOf: new Date().toISOString() }

  const direct = rates.find((row) => row.from_currency === from && row.to_currency === to && row.rate > 0)
  if (direct) return { rate: direct.rate, asOf: direct.as_of }

  const inverse = rates.find((row) => row.from_currency === to && row.to_currency === from && row.rate > 0)
  if (inverse) return { rate: 1 / inverse.rate, asOf: inverse.as_of }

  return null
}

export async function ensureExchangeRatesFresh(admin: SupabaseClient): Promise<ExchangeRateRow[]> {
  const current = await listExchangeRates(admin)
  if (areExchangeRatesFresh(current, getFxRefreshTtlMs())) {
    return current
  }

  // Fail-open: if refresh fails, keep previously stored rates.
  const synced = await syncOpenExchangeRates(admin)
  if (!synced.ok) return current
  return listExchangeRates(admin)
}

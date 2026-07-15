import type { SupabaseClient } from "@supabase/supabase-js"
import {
  isReportingFxPair,
  REPORTING_FX_CURRENCY_CODES,
} from "@/lib/fx/reporting-fx"
import { getFxRatesRefreshTtlMs, syncReportingFxRatesSafe } from "@/lib/fx/p2p-rate-sync"

export type ExchangeRateRow = {
  from_currency: string
  to_currency: string
  rate: number
  as_of: string
}

export async function listReportingFxRates(admin: SupabaseClient): Promise<ExchangeRateRow[]> {
  const codes = [...REPORTING_FX_CURRENCY_CODES]
  const { data, error } = await admin
    .from("exchange_rates")
    .select("from_currency,to_currency,rate,as_of")
    .eq("status", "active")
    .in("from_currency", codes)
    .in("to_currency", codes)

  if (error) {
    console.warn("[exchange_rates] list reporting:", error.message)
    return []
  }

  return (data ?? [])
    .map((row) => ({
      from_currency: String(row.from_currency ?? "").toUpperCase(),
      to_currency: String(row.to_currency ?? "").toUpperCase(),
      rate: Number(row.rate ?? 0),
      as_of: String(row.as_of ?? new Date().toISOString()),
    }))
    .filter((row) => isReportingFxPair(row.from_currency, row.to_currency) && row.rate > 0)
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
 * Fire-and-forget P2P rate sync when cached DB rows are stale (USD/EUR dashboard, ledger, etc.).
 */
export function triggerExchangeRatesBackgroundRefresh(
  _admin: SupabaseClient,
  currentRates: ExchangeRateRow[],
  maxAgeMs = getFxRatesRefreshTtlMs(),
): void {
  if (areExchangeRatesFresh(currentRates, maxAgeMs)) return
  if (backgroundSyncInFlight) return
  backgroundSyncInFlight = (async () => {
    try {
      await syncReportingFxRatesSafe()
    } catch {
      // Best-effort background refresh only.
    } finally {
      backgroundSyncInFlight = null
    }
  })()
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
  if (areExchangeRatesFresh(current, getFxRatesRefreshTtlMs())) {
    return current
  }

  const synced = await syncReportingFxRatesSafe()
  if (!synced.ok) return current
  return listExchangeRates(admin)
}

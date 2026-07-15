import { syncExchangeRatesFromModel, type SyncResult } from "@easner/rate-sync"
import { REPORTING_FX_CURRENCY_CODES } from "@/lib/fx/reporting-fx"

export type { SyncResult }

export function getFxRatesRefreshTtlMs(): number {
  const parsed = Number.parseInt(process.env.FX_RATES_REFRESH_TTL_MS || "86400000", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 86_400_000
  return parsed
}

function getSupabaseServiceConfig(): { supabaseUrl: string; serviceRoleKey: string } {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("supabase_not_configured")
  }
  return { supabaseUrl, serviceRoleKey }
}

/** Recompute reporting FX rows from the Easner P2P pricing model (USD/EUR/GBP/NGN crosses only). */
export async function syncReportingFxRates(options?: { dryRun?: boolean }): Promise<SyncResult> {
  const { supabaseUrl, serviceRoleKey } = getSupabaseServiceConfig()
  return syncExchangeRatesFromModel({
    supabaseUrl,
    serviceRoleKey,
    dryRun: options?.dryRun,
    currencyCodes: [...REPORTING_FX_CURRENCY_CODES],
  })
}

/** @deprecated Use syncReportingFxRates */
export async function syncP2pExchangeRates(options?: { dryRun?: boolean }): Promise<SyncResult> {
  return syncReportingFxRates(options)
}

export async function syncReportingFxRatesSafe(
  options?: { dryRun?: boolean },
): Promise<{ ok: true; result: SyncResult } | { ok: false; reason: string }> {
  try {
    const result = await syncReportingFxRates(options)
    return { ok: true, result }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

export async function syncP2pExchangeRatesSafe(
  options?: { dryRun?: boolean },
): Promise<{ ok: true; result: SyncResult } | { ok: false; reason: string }> {
  return syncReportingFxRatesSafe(options)
}

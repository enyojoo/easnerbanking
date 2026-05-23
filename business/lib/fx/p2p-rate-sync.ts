import { syncExchangeRatesFromModel, type SyncResult } from "@easner/rate-sync"

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

/** Recompute all existing `exchange_rates` rows from the Easner P2P pricing model. */
export async function syncP2pExchangeRates(options?: { dryRun?: boolean }): Promise<SyncResult> {
  const { supabaseUrl, serviceRoleKey } = getSupabaseServiceConfig()
  return syncExchangeRatesFromModel({
    supabaseUrl,
    serviceRoleKey,
    dryRun: options?.dryRun,
  })
}

export async function syncP2pExchangeRatesSafe(
  options?: { dryRun?: boolean },
): Promise<{ ok: true; result: SyncResult } | { ok: false; reason: string }> {
  try {
    const result = await syncP2pExchangeRates(options)
    return { ok: true, result }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

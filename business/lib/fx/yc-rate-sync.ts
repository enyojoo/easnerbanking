import {
  parseYcPayoutMarginFromEnv,
  syncYcRatesToSupabase,
  buildYcCrossPairsFromFiats,
  isYcFiatCurrency,
  loadYcFiatCurrenciesFromSupabase,
  type YcCrossPairInput,
  type YcRateSyncResult,
} from "@easner/rate-sync"
import { createClient } from "@supabase/supabase-js"
import { listYellowcardRates, normalizeYcRateRow } from "@/lib/yellowcard/rates"

export type { YcRateSyncResult }

/** Optional override: YC_CROSS_PAIRS=NGN:KES,NGN:GHS – otherwise all fiat crosses are generated. */
function resolveCrossPairs(fiatCodes: string[]): YcCrossPairInput[] {
  const fromEnv = (process.env.YC_CROSS_PAIRS || "").trim()
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
  return buildYcCrossPairsFromFiats(fiatCodes)
}

function getSupabaseServiceConfig(): { supabaseUrl: string; serviceRoleKey: string } {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("supabase_not_configured")
  }
  return { supabaseUrl, serviceRoleKey }
}

export async function syncYcExchangeRates(options?: {
  dryRun?: boolean
}): Promise<YcRateSyncResult> {
  const { supabaseUrl, serviceRoleKey } = getSupabaseServiceConfig()
  const margin = parseYcPayoutMarginFromEnv(process.env.YC_PAYOUT_MARGIN)

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const corridorFiats = await loadYcFiatCurrenciesFromSupabase(admin)
  const allowlist = new Set(corridorFiats)

  const rawRates = await listYellowcardRates()
  const currencies = rawRates
    .map(normalizeYcRateRow)
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .filter((r) => isYcFiatCurrency(r.currency))
    .filter((r) => allowlist.size === 0 || allowlist.has(r.currency))
    .map((r) => ({
      currency: r.currency,
      yc_buy: r.buy,
      yc_sell: r.sell,
    }))

  if (currencies.length === 0) {
    return syncYcRatesToSupabase({
      supabaseUrl,
      serviceRoleKey,
      currencies: [],
      crossPairs: [],
      dryRun: options?.dryRun,
      margin,
      allowlist: allowlist.size > 0 ? allowlist : null,
    })
  }

  const fiatCodes = currencies.map((c) => c.currency)

  return syncYcRatesToSupabase({
    supabaseUrl,
    serviceRoleKey,
    currencies,
    crossPairs: resolveCrossPairs(fiatCodes),
    dryRun: options?.dryRun,
    margin,
    allowlist: allowlist.size > 0 ? allowlist : null,
  })
}

export async function syncYcRatesSafe(
  options?: { dryRun?: boolean },
): Promise<{ ok: true; result: YcRateSyncResult } | { ok: false; reason: string }> {
  try {
    const result = await syncYcExchangeRates(options)
    return { ok: true, result }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

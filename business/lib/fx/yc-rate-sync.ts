import {
  parseYcPayoutMarginFromEnv,
  syncYcRatesToSupabase,
  type YcCrossPairInput,
  type YcRateSyncResult,
} from "@easner/rate-sync"
import { listYellowcardRates, normalizeYcRateRow } from "@/lib/yellowcard/rates"

export type { YcRateSyncResult }

/** Default cross pairs for Through Local Currency (extend via env YC_CROSS_PAIRS=NGN:KES,NGN:GHS). */
function defaultCrossPairs(): YcCrossPairInput[] {
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
  return [
    { from_currency: "NGN", to_currency: "KES" },
    { from_currency: "NGN", to_currency: "GHS" },
    { from_currency: "KES", to_currency: "NGN" },
    { from_currency: "GHS", to_currency: "NGN" },
  ]
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

  const rawRates = await listYellowcardRates()
  const currencies = rawRates
    .map(normalizeYcRateRow)
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      currency: r.currency,
      yc_buy: r.buy,
      yc_sell: r.sell,
    }))

  if (currencies.length === 0) {
    return { updated: 0, skipped: 0, pairs: [], skippedPairs: [] }
  }

  return syncYcRatesToSupabase({
    supabaseUrl,
    serviceRoleKey,
    currencies,
    crossPairs: defaultCrossPairs(),
    dryRun: options?.dryRun,
    margin,
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

import {
  loadNoahRatePairsFromSupabase,
  parseNoahPayoutMarginFromEnv,
  seedNoahRatePairRows,
  syncNoahRatesToSupabase,
  type NoahRateSyncResult,
} from "@easner/rate-sync"
import { createClient } from "@supabase/supabase-js"
import { noahImpliedProviderRate } from "@/lib/noah/fx-prices"

export type { NoahRateSyncResult }

function getSupabaseServiceConfig(): { supabaseUrl: string; serviceRoleKey: string } {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("supabase_not_configured")
  }
  return { supabaseUrl, serviceRoleKey }
}

export async function syncNoahExchangeRates(options?: {
  dryRun?: boolean
  seedMissing?: boolean
}): Promise<NoahRateSyncResult> {
  const { supabaseUrl, serviceRoleKey } = getSupabaseServiceConfig()
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const margin = parseNoahPayoutMarginFromEnv(process.env.NOAH_PAYOUT_MARGIN)
  const pairs = await loadNoahRatePairsFromSupabase(supabase)
  if (pairs.length === 0) {
    return { updated: 0, skipped: 0, pairs: [], skippedPairs: [] }
  }

  if (options?.seedMissing) {
    await seedNoahRatePairRows({
      supabaseUrl,
      serviceRoleKey,
      margin,
      pairs: pairs.map((p) => ({
        from_currency: p.from_currency,
        to_currency: p.to_currency,
        country_code: p.country_code,
      })),
    })
  }

  const inputs: Array<{
    from_currency: string
    to_currency: string
    country_code: string
    noah_mid: number
  }> = []
  const skippedPairs: Array<{ from_currency: string; to_currency: string; reason: string }> = []

  for (const pair of pairs) {
    try {
      const noah_mid = await noahImpliedProviderRate({
        sourceCurrency: pair.from_currency,
        destinationCurrency: pair.to_currency,
        sourceAmount: 100,
        country: pair.country_code,
      })
      if (!Number.isFinite(noah_mid) || noah_mid <= 0) {
        skippedPairs.push({
          from_currency: pair.from_currency,
          to_currency: pair.to_currency,
          reason: "invalid mid from Noah",
        })
        continue
      }
      inputs.push({
        from_currency: pair.from_currency,
        to_currency: pair.to_currency,
        country_code: pair.country_code,
        noah_mid,
      })
    } catch (e) {
      skippedPairs.push({
        from_currency: pair.from_currency,
        to_currency: pair.to_currency,
        reason: e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120),
      })
    }
  }

  const result = await syncNoahRatesToSupabase({
    supabaseUrl,
    serviceRoleKey,
    inputs,
    dryRun: options?.dryRun,
    margin,
  })

  return {
    ...result,
    skipped: result.skipped + skippedPairs.length,
    skippedPairs: [...result.skippedPairs, ...skippedPairs],
  }
}

export async function syncNoahRatesSafe(
  options?: { dryRun?: boolean; seedMissing?: boolean },
): Promise<{ ok: true; result: NoahRateSyncResult } | { ok: false; reason: string }> {
  try {
    const result = await syncNoahExchangeRates(options)
    return { ok: true, result }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }
}

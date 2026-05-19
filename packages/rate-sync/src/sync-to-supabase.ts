import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { buildEasnerLegs, crossRate, type LegMap } from "./build-legs"

export interface SyncResult {
  updated: number
  skipped: number
  pairs: Array<{ from_currency: string; to_currency: string; rate: number }>
  skippedPairs: Array<{ from_currency: string; to_currency: string; reason: string }>
  legs: LegMap
}

/**
 * Recompute rates from P2P model. Upserts only rate + updated_at (preserves admin fees/limits).
 */
export async function syncExchangeRatesFromModel(options: {
  supabaseUrl: string
  serviceRoleKey: string
  dryRun?: boolean
}): Promise<SyncResult> {
  const { supabaseUrl, serviceRoleKey, dryRun } = options
  const supabase: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: rows, error: loadError } = await supabase
    .from("exchange_rates")
    .select("from_currency, to_currency")

  if (loadError) throw loadError
  if (!rows?.length) {
    return { updated: 0, skipped: 0, pairs: [], skippedPairs: [], legs: {} }
  }

  const codes = new Set<string>()
  for (const r of rows) {
    codes.add(String(r.from_currency))
    codes.add(String(r.to_currency))
  }

  const legs = await buildEasnerLegs([...codes])

  const updates: Array<{
    from_currency: string
    to_currency: string
    rate: number
    updated_at: string
  }> = []
  const skippedPairs: Array<{ from_currency: string; to_currency: string; reason: string }> = []

  for (const r of rows) {
    const from = String(r.from_currency)
    const to = String(r.to_currency)
    if (from === to) {
      skippedPairs.push({ from_currency: from, to_currency: to, reason: "same currency" })
      continue
    }
    const rate = crossRate(from, to, legs)
    if (rate == null || !Number.isFinite(rate) || rate <= 0) {
      skippedPairs.push({
        from_currency: from,
        to_currency: to,
        reason: "missing leg or invalid rate",
      })
      continue
    }
    updates.push({
      from_currency: from,
      to_currency: to,
      rate: Number(rate.toPrecision(14)),
      updated_at: new Date().toISOString(),
    })
  }

  if (!dryRun && updates.length > 0) {
    const { error: upErr } = await supabase.from("exchange_rates").upsert(updates, {
      onConflict: "from_currency,to_currency",
    })
    if (upErr) throw upErr
  }

  return {
    updated: updates.length,
    skipped: skippedPairs.length,
    pairs: updates.map((u) => ({
      from_currency: u.from_currency,
      to_currency: u.to_currency,
      rate: u.rate,
    })),
    skippedPairs,
    legs,
  }
}

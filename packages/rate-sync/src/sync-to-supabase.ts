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
 * Recompute rates from P2P model. Upserts rate + timestamps only.
 * When `currencyCodes` is set, only those crosses are loaded and updated.
 */
export async function syncExchangeRatesFromModel(options: {
  supabaseUrl: string
  serviceRoleKey: string
  dryRun?: boolean
  /** When set, only sync pairs where both legs are in this list. */
  currencyCodes?: string[]
}): Promise<SyncResult> {
  const { supabaseUrl, serviceRoleKey, dryRun, currencyCodes } = options
  const allowed =
    currencyCodes?.map((c) => c.trim().toUpperCase()).filter(Boolean) ?? null
  const allowedSet = allowed?.length ? new Set(allowed) : null

  const supabase: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let query = supabase.from("exchange_rates").select("from_currency, to_currency")
  if (allowedSet) {
    query = query.in("from_currency", [...allowedSet]).in("to_currency", [...allowedSet])
  }

  const { data: rows, error: loadError } = await query

  if (loadError) throw loadError

  const pairRows = (rows ?? []).filter((r) => {
    const from = String(r.from_currency ?? "").toUpperCase()
    const to = String(r.to_currency ?? "").toUpperCase()
    if (from === to) return false
    if (!allowedSet) return true
    return allowedSet.has(from) && allowedSet.has(to)
  })

  if (!pairRows.length) {
    return { updated: 0, skipped: 0, pairs: [], skippedPairs: [], legs: {} }
  }

  const codes = new Set<string>()
  for (const r of pairRows) {
    codes.add(String(r.from_currency))
    codes.add(String(r.to_currency))
  }

  const legs = await buildEasnerLegs([...codes])

  const nowIso = new Date().toISOString()
  const updates: Array<{
    from_currency: string
    to_currency: string
    rate: number
    source: string
    as_of: string
    updated_at: string
  }> = []
  const skippedPairs: Array<{ from_currency: string; to_currency: string; reason: string }> = []

  for (const r of pairRows) {
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
      source: "p2p_sync",
      as_of: nowIso,
      updated_at: nowIso,
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

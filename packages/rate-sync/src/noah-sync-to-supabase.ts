import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { applyNoahCustomerRate, easnerBridgeMarginBps, NOAH_PAYOUT_MARGIN } from "./noah-margin"

export type NoahRateSyncInput = {
  from_currency: string
  to_currency: string
  country_code?: string
  noah_mid: number
}

export type NoahRateSyncResult = {
  updated: number
  skipped: number
  pairs: Array<{
    from_currency: string
    to_currency: string
    noah_mid: number
    rate: number
  }>
  skippedPairs: Array<{ from_currency: string; to_currency: string; reason: string }>
}

type ExistingRow = {
  from_currency: string
  to_currency: string
  source: string | null
  fee_type: string | null
  fee_amount: number | null
  min_amount: number | null
  max_amount: number | null
}

/**
 * Upsert Noah mids + margin-applied customer rates.
 * Preserves office fee/limit overrides (rows with source = 'office' keep fee fields on conflict).
 */
export async function syncNoahRatesToSupabase(options: {
  supabaseUrl: string
  serviceRoleKey: string
  inputs: NoahRateSyncInput[]
  dryRun?: boolean
  margin?: number
}): Promise<NoahRateSyncResult> {
  const { supabaseUrl, serviceRoleKey, inputs, dryRun, margin = NOAH_PAYOUT_MARGIN } = options
  const supabase: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: existingRows, error: loadError } = await supabase
    .from("noah_rates")
    .select("from_currency,to_currency,source,fee_type,fee_amount,min_amount,max_amount")

  if (loadError) throw loadError

  const existingByKey = new Map<string, ExistingRow>()
  for (const row of existingRows ?? []) {
    const from = String(row.from_currency).toUpperCase()
    const to = String(row.to_currency).toUpperCase()
    existingByKey.set(`${from}_${to}`, row as ExistingRow)
  }

  const nowIso = new Date().toISOString()
  const marginBps = easnerBridgeMarginBps(margin)
  const updates: Array<Record<string, unknown>> = []
  const skippedPairs: Array<{ from_currency: string; to_currency: string; reason: string }> = []

  for (const input of inputs) {
    const from = input.from_currency.trim().toUpperCase()
    const to = input.to_currency.trim().toUpperCase()
    const mid = input.noah_mid
    if (!from || !to || from === to) {
      skippedPairs.push({ from_currency: from, to_currency: to, reason: "invalid pair" })
      continue
    }
    if (!Number.isFinite(mid) || mid <= 0) {
      skippedPairs.push({ from_currency: from, to_currency: to, reason: "invalid noah_mid" })
      continue
    }

    const rate = applyNoahCustomerRate(mid, margin)
    const key = `${from}_${to}`
    const existing = existingByKey.get(key)
    const country = input.country_code?.trim().toUpperCase() || null

    const payload: Record<string, unknown> = {
      from_currency: from,
      to_currency: to,
      country_code: country,
      noah_mid: Number(mid.toPrecision(14)),
      rate: Number(rate.toPrecision(14)),
      margin_bps: marginBps,
      source: "noah_prices_sync",
      as_of: nowIso,
      updated_at: nowIso,
      status: "active",
    }

    if (existing?.source === "office") {
      payload.source = "office"
      if (existing.fee_type != null) payload.fee_type = existing.fee_type
      if (existing.fee_amount != null) payload.fee_amount = existing.fee_amount
      if (existing.min_amount != null) payload.min_amount = existing.min_amount
      if (existing.max_amount != null) payload.max_amount = existing.max_amount
    }

    updates.push(payload)
  }

  if (!dryRun && updates.length > 0) {
    const { error: upErr } = await supabase.from("noah_rates").upsert(updates, {
      onConflict: "from_currency,to_currency",
    })
    if (upErr) throw upErr
  }

  return {
    updated: updates.length,
    skipped: skippedPairs.length,
    pairs: updates.map((u) => ({
      from_currency: String(u.from_currency),
      to_currency: String(u.to_currency),
      noah_mid: Number(u.noah_mid),
      rate: Number(u.rate),
    })),
    skippedPairs,
  }
}

/** Seed placeholder rows for all pairs (rate 0, pending_sync) before first Noah fetch. */
export async function seedNoahRatePairRows(options: {
  supabaseUrl: string
  serviceRoleKey: string
  pairs: Array<{ from_currency: string; to_currency: string; country_code: string }>
}): Promise<number> {
  const { supabaseUrl, serviceRoleKey, pairs } = options
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const nowIso = new Date().toISOString()
  const rows = pairs.map((p) => ({
    from_currency: p.from_currency.toUpperCase(),
    to_currency: p.to_currency.toUpperCase(),
    country_code: p.country_code.toUpperCase(),
    noah_mid: 0,
    rate: 0,
    margin_bps: easnerBridgeMarginBps(),
    source: "seed",
    as_of: nowIso,
    status: "pending_sync",
    updated_at: nowIso,
  }))
  if (rows.length === 0) return 0
  const { error } = await supabase.from("noah_rates").upsert(rows, {
    onConflict: "from_currency,to_currency",
    ignoreDuplicates: true,
  })
  if (error) throw error
  return rows.length
}

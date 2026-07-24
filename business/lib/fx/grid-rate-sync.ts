import { createClient } from "@supabase/supabase-js"
import {
  applyGridMargin,
  fetchLiveGridExchangeRates,
} from "@/lib/fx/grid-rates"
import { getGridPayoutMarginBps } from "@/lib/grid/config"

export type GridRateSyncResult = {
  ok: boolean
  upserted: number
  skipped: number
  error?: string
}

function getSupabaseServiceConfig(): { supabaseUrl: string; serviceRoleKey: string } {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("supabase_not_configured")
  }
  return { supabaseUrl, serviceRoleKey }
}

export async function syncGridExchangeRates(options?: {
  dryRun?: boolean
}): Promise<GridRateSyncResult> {
  const { supabaseUrl, serviceRoleKey } = getSupabaseServiceConfig()
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const marginBps = getGridPayoutMarginBps()
  const live = await fetchLiveGridExchangeRates()
  if (live.length === 0) {
    return { ok: true, upserted: 0, skipped: 0 }
  }

  const now = new Date().toISOString()
  let upserted = 0
  for (const row of live) {
    const customerRate = applyGridMargin(row.mid, marginBps)
    const payload = {
      from_currency: row.from,
      to_currency: row.to,
      country_code: row.country ?? null,
      grid_mid: row.mid,
      rate: customerRate,
      margin_bps: marginBps,
      source: "grid_rates_sync",
      as_of: now,
      status: "active",
      updated_at: now,
    }
    if (options?.dryRun) {
      upserted++
      continue
    }
    const { error } = await admin.from("grid_rates").upsert(payload, {
      onConflict: "from_currency,to_currency",
    })
    if (error) {
      console.warn("[grid_rates] upsert failed", row.from, row.to, error.message)
      continue
    }
    upserted++
    if (row.from === "USD" && row.to !== "USD" && row.mid > 0) {
      const payInMid = 1 / row.mid
      const payInCustomer = applyGridMargin(payInMid, marginBps)
      const payInPayload = {
        from_currency: row.to,
        to_currency: "USD",
        country_code: row.country ?? null,
        grid_mid: payInMid,
        rate: payInCustomer,
        margin_bps: marginBps,
        source: "grid_rates_sync",
        as_of: now,
        status: "active",
        updated_at: now,
      }
      if (options?.dryRun) {
        upserted++
        continue
      }
      const { error: payInErr } = await admin.from("grid_rates").upsert(payInPayload, {
        onConflict: "from_currency,to_currency",
      })
      if (payInErr) {
        console.warn("[grid_rates] pay-in upsert failed", row.to, "USD", payInErr.message)
      } else {
        upserted++
      }
    }
  }

  return { ok: true, upserted, skipped: Math.max(0, live.length * 2 - upserted) }
}

export async function syncGridRatesSafe(options?: {
  dryRun?: boolean
}): Promise<GridRateSyncResult> {
  try {
    return await syncGridExchangeRates(options)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "grid_rate_sync_failed"
    console.warn("[grid_rates] sync failed:", msg)
    return { ok: false, upserted: 0, skipped: 0, error: msg }
  }
}

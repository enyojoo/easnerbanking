import type { SupabaseClient } from "@supabase/supabase-js"
import { applyGridMargin, listGridRates, type GridRateRow } from "@/lib/fx/grid-rates"
import { getGridPayoutMarginBps } from "@/lib/grid/config"

export type GridRateAdminRow = GridRateRow & {
  updated_at?: string
}

export type GridRateUpsertRow = {
  from_currency: string
  to_currency: string
  rate: number
  grid_mid?: number | null
  margin_bps?: number
  status?: string
}

export async function listGridRatesAdmin(admin: SupabaseClient): Promise<GridRateAdminRow[]> {
  return listGridRates(admin, { status: "all" }, { backgroundRefresh: false })
}

export async function upsertGridRatesAdmin(admin: SupabaseClient, rows: GridRateUpsertRow[]) {
  const now = new Date().toISOString()
  const defaultMarginBps = getGridPayoutMarginBps()

  const payload = rows.map((row) => {
    const from = String(row.from_currency ?? "").trim().toUpperCase()
    const to = String(row.to_currency ?? "").trim().toUpperCase()
    if (!from || !to || from.length !== 3 || to.length !== 3) {
      throw new Error(`Invalid Grid rates pair: ${from} → ${to}`)
    }

    const marginBps =
      row.margin_bps != null && Number.isFinite(row.margin_bps)
        ? Math.round(row.margin_bps)
        : defaultMarginBps

    const gridMid =
      row.grid_mid != null && Number.isFinite(row.grid_mid) && row.grid_mid > 0
        ? Number(row.grid_mid)
        : null

    let rate = Number(row.rate) || 0
    if (rate <= 0 && gridMid != null) {
      rate = applyGridMargin(gridMid, marginBps)
    }

    return {
      from_currency: from,
      to_currency: to,
      grid_mid: gridMid,
      rate,
      margin_bps: marginBps,
      source: "office",
      as_of: now,
      updated_at: now,
      status: row.status ?? "active",
    }
  })

  if (payload.length === 0) return

  const { error } = await admin.from("grid_rates").upsert(payload, {
    onConflict: "from_currency,to_currency",
  })
  if (error) throw error
}

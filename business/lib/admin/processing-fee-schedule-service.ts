import type { SupabaseClient } from "@supabase/supabase-js"
import { DEFAULT_PAYOUT_PROCESSING_FEE_BPS } from "@easner/shared"
import { isExcludedPayoutCorridorCountry } from "@/lib/payout-corridors-exclusions"

export type ProcessingFeeScheduleScope = "fiat_bank" | "fiat_mobile_money" | "crypto"

export type ProcessingFeeDirection = "pay_in" | "pay_out" | "cross_border"

export type ProcessingFeeScheduleRow = {
  id?: string
  scope: ProcessingFeeScheduleScope
  country_code: string | null
  currency_code: string | null
  asset_code: string | null
  country_name?: string | null
  currency_name?: string | null
  asset_name?: string | null
  pay_in_bps: number
  pay_out_bps: number
  cross_border_bps: number
  updated_at?: string
}

export type ProcessingFeeScheduleUpsertRow = {
  scope: ProcessingFeeScheduleScope
  country_code?: string | null
  currency_code?: string | null
  asset_code?: string | null
  pay_in_bps: number
  pay_out_bps: number
  cross_border_bps: number
}

const DEFAULT_BPS = DEFAULT_PAYOUT_PROCESSING_FEE_BPS

function normalizeBps(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return DEFAULT_BPS
  return Math.round(n)
}

function railForScope(scope: ProcessingFeeScheduleScope): "bank_transfer" | "mobile_money" | null {
  if (scope === "fiat_bank") return "bank_transfer"
  if (scope === "fiat_mobile_money") return "mobile_money"
  return null
}

function corridorHasRailCapability(row: Record<string, unknown>): boolean {
  const cc = String(row.country_code ?? "").trim().toUpperCase()
  const cur = String(row.currency_code ?? "").trim().toUpperCase()
  const rail = String(row.rail ?? "bank_transfer") === "mobile_money" ? "mobile_money" : "bank_transfer"
  if (cc === "NG" && cur === "NGN" && rail === "mobile_money") return false

  if (
    row.noah_sell_available === true ||
    row.yc_send_available === true ||
    row.yc_receive_available === true ||
    row.grid_send_available === true ||
    row.grid_receive_available === true
  ) {
    return true
  }

  const meta = (row.metadata ?? {}) as Record<string, unknown>
  if (
    meta.noah_send_enabled === true ||
    meta.yc_send_enabled === true ||
    meta.grid_send_enabled === true ||
    meta.noah_receive_enabled === true ||
    meta.yc_receive_enabled === true ||
    meta.grid_receive_enabled === true ||
    meta.cross_border_enabled === true
  ) {
    return true
  }

  const routing = row.provider_routing
  if (!Array.isArray(routing) || routing.length === 0) return false
  return (
    meta.yc_send === true ||
    meta.yc_receive === true ||
    meta.grid_send === true ||
    meta.grid_receive === true ||
    meta.noah_receive === true
  )
}

async function listFiatCatalog(
  admin: SupabaseClient,
  scope: "fiat_bank" | "fiat_mobile_money",
): Promise<Array<{ country_code: string; currency_code: string; country_name: string; currency_name: string }>> {
  const rail = railForScope(scope)!
  const { data, error } = await admin
    .from("payout_corridors")
    .select("country_code,currency_code,country_name,currency_name,rail,noah_sell_available,yc_send_available,yc_receive_available,grid_send_available,grid_receive_available,metadata,provider_routing")
    .eq("rail", rail)
    .order("country_name", { ascending: true })

  if (error) throw error

  const map = new Map<string, { country_code: string; currency_code: string; country_name: string; currency_name: string }>()
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>
    if (!corridorHasRailCapability(r)) continue
    const cc = String(r.country_code ?? "").trim().toUpperCase()
    if (!cc || isExcludedPayoutCorridorCountry(cc)) continue
    const cur = String(r.currency_code ?? "").trim().toUpperCase()
    if (!cur) continue
    const key = `${cc}:${cur}`
    if (!map.has(key)) {
      map.set(key, {
        country_code: cc,
        currency_code: cur,
        country_name: String(r.country_name ?? cc),
        currency_name: String(r.currency_name ?? cur),
      })
    }
  }
  return [...map.values()]
}

async function listCryptoCatalog(
  admin: SupabaseClient,
): Promise<Array<{ asset_code: string; asset_name: string }>> {
  const { data, error } = await admin
    .from("crypto_destinations")
    .select("asset_code,asset_name")
    .order("asset_code", { ascending: true })

  if (error) throw error

  const map = new Map<string, { asset_code: string; asset_name: string }>()
  for (const row of data ?? []) {
    const code = String((row as { asset_code?: string }).asset_code ?? "").trim().toUpperCase()
    if (!code) continue
    if (!map.has(code)) {
      map.set(code, {
        asset_code: code,
        asset_name: String((row as { asset_name?: string }).asset_name ?? code),
      })
    }
  }
  return [...map.values()]
}

export async function listProcessingFeeScheduleAdmin(
  admin: SupabaseClient,
  scope: ProcessingFeeScheduleScope,
): Promise<ProcessingFeeScheduleRow[]> {
  const { data: stored, error } = await admin
    .from("processing_fee_schedule")
    .select("*")
    .eq("scope", scope)

  if (error) throw error

  const byKey = new Map<string, Record<string, unknown>>()
  for (const row of stored ?? []) {
    const r = row as Record<string, unknown>
    if (scope === "crypto") {
      const asset = String(r.asset_code ?? "").trim().toUpperCase()
      if (asset) byKey.set(asset, r)
    } else {
      const cc = String(r.country_code ?? "").trim().toUpperCase()
      const cur = String(r.currency_code ?? "").trim().toUpperCase()
      if (cc && cur) byKey.set(`${cc}:${cur}`, r)
    }
  }

  if (scope === "crypto") {
    const catalog = await listCryptoCatalog(admin)
    return catalog.map((item) => {
      const existing = byKey.get(item.asset_code)
      return {
        id: existing?.id ? String(existing.id) : undefined,
        scope,
        country_code: null,
        currency_code: null,
        asset_code: item.asset_code,
        asset_name: item.asset_name,
        pay_in_bps: normalizeBps(existing?.pay_in_bps),
        pay_out_bps: normalizeBps(existing?.pay_out_bps),
        cross_border_bps: normalizeBps(existing?.cross_border_bps),
        updated_at: existing?.updated_at ? String(existing.updated_at) : undefined,
      }
    })
  }

  const catalog = await listFiatCatalog(admin, scope)
  return catalog.map((item) => {
    const key = `${item.country_code}:${item.currency_code}`
    const existing = byKey.get(key)
    return {
      id: existing?.id ? String(existing.id) : undefined,
      scope,
      country_code: item.country_code,
      currency_code: item.currency_code,
      asset_code: null,
      country_name: item.country_name,
      currency_name: item.currency_name,
      pay_in_bps: normalizeBps(existing?.pay_in_bps),
      pay_out_bps: normalizeBps(existing?.pay_out_bps),
      cross_border_bps: normalizeBps(existing?.cross_border_bps),
      updated_at: existing?.updated_at ? String(existing.updated_at) : undefined,
    }
  })
}

export async function upsertProcessingFeeScheduleAdmin(
  admin: SupabaseClient,
  rows: ProcessingFeeScheduleUpsertRow[],
  updatedBy: string | null,
) {
  const now = new Date().toISOString()
  const payload = rows.map((row) => {
    const scope = row.scope
    if (scope === "crypto") {
      const asset = String(row.asset_code ?? "").trim().toUpperCase()
      if (!asset) throw new Error("asset_code required for crypto scope")
      return {
        scope,
        country_code: null,
        currency_code: null,
        asset_code: asset,
        pay_in_bps: normalizeBps(row.pay_in_bps),
        pay_out_bps: normalizeBps(row.pay_out_bps),
        cross_border_bps: normalizeBps(row.cross_border_bps),
        updated_by: updatedBy,
        updated_at: now,
      }
    }

    const cc = String(row.country_code ?? "").trim().toUpperCase()
    const cur = String(row.currency_code ?? "").trim().toUpperCase()
    if (!cc || !cur) throw new Error("country_code and currency_code required for fiat scope")

    return {
      scope,
      country_code: cc,
      currency_code: cur,
      asset_code: null,
      pay_in_bps: normalizeBps(row.pay_in_bps),
      pay_out_bps: normalizeBps(row.pay_out_bps),
      cross_border_bps: normalizeBps(row.cross_border_bps),
      updated_by: updatedBy,
      updated_at: now,
    }
  })

  if (payload.length === 0) return

  const conflict =
    payload[0]?.scope === "crypto"
      ? "scope,asset_code"
      : "scope,country_code,currency_code"

  const { error } = await admin.from("processing_fee_schedule").upsert(payload, { onConflict: conflict })
  if (error) throw error
}

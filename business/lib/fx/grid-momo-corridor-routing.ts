import type { SupabaseClient } from "@supabase/supabase-js"
import {
  currencyDisplayName,
  countryDisplayName,
  isCustomerFacingFiatCorridorLive,
  isGridMomoOnlyCorridor,
  listGridMomoOnlyCorridorPairs,
} from "@easner/shared"
import { corridorHasConfiguredGridOps } from "@/lib/fx/corridor-office-ops-guard"
import { upsertPayoutCorridor } from "@/lib/payout-corridors-upsert"

type CorridorRow = {
  id: string
  country_code: string
  currency_code: string
  rail: string
  enabled: boolean | null
  metadata: Record<string, unknown> | null
  provider_routing: unknown
  fields_schema: Record<string, unknown> | null
  country_name: string | null
}

type RoutingEntry = { provider?: string; priority?: number; settlement_asset?: string }

function rowMetadata(row: CorridorRow): Record<string, unknown> {
  return row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? { ...(row.metadata as Record<string, unknown>) }
    : {}
}

function parseRouting(raw: unknown): RoutingEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((e) => e && typeof e === "object") as RoutingEntry[]
}

function routingWithoutGrid(raw: unknown): RoutingEntry[] {
  return parseRouting(raw).filter(
    (e) => String(e.provider ?? "").trim().toLowerCase() !== "grid",
  )
}

function mergeGridRouting(existing: unknown, gridWasPrimary: boolean): RoutingEntry[] {
  const withoutGrid = routingWithoutGrid(existing)
  const gridEntry: RoutingEntry = { provider: "grid", priority: 1, settlement_asset: "USDC" }
  if (!gridWasPrimary) {
    return [gridEntry, ...withoutGrid.map((e, i) => ({ ...e, priority: i + 2 }))]
  }
  return [gridEntry, ...withoutGrid.map((e, i) => ({ ...e, priority: i + 2 }))]
}

function gridWasPrimaryRouting(raw: unknown): boolean {
  const routing = parseRouting(raw)
  const sorted = [...routing].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
  return String(sorted[0]?.provider ?? "").trim().toLowerCase() === "grid"
}

function bankRowHasGridOps(meta: Record<string, unknown>): boolean {
  return corridorHasConfiguredGridOps(meta)
}

function applyGridOpsFromBankToMobile(
  bankMeta: Record<string, unknown>,
  mobileMeta: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...mobileMeta }
  if (bankMeta.grid_send_enabled === true) out.grid_send_enabled = true
  if (bankMeta.grid_receive_enabled === true) out.grid_receive_enabled = true
  if (String(bankMeta.cross_border_provider ?? "").trim().toLowerCase() === "grid") {
    out.cross_border_enabled = bankMeta.cross_border_enabled === true
    out.cross_border_provider = "grid"
  }
  return out
}

function stripConfiguredGridOfficeOps(meta: Record<string, unknown>): Record<string, unknown> {
  const out = { ...meta }
  delete out.grid_send_enabled
  delete out.grid_receive_enabled
  if (String(out.cross_border_provider ?? "").trim().toLowerCase() === "grid") {
    delete out.cross_border_enabled
    delete out.cross_border_provider
  }
  return out
}

function stripGridOps(meta: Record<string, unknown>): Record<string, unknown> {
  const out = stripConfiguredGridOfficeOps(meta)
  delete out.grid_send
  delete out.grid_receive
  return out
}

function rowHasOrphanGridRouting(row: CorridorRow): boolean {
  const hasGridRouting = parseRouting(row.provider_routing).some(
    (e) => String(e.provider ?? "").trim().toLowerCase() === "grid",
  )
  if (!hasGridRouting) return false
  return !corridorHasConfiguredGridOps(rowMetadata(row))
}

async function clearStaleGridOfficeOpsOnRow(
  admin: SupabaseClient,
  row: CorridorRow,
): Promise<boolean> {
  const meta = rowMetadata(row)
  const strippedMeta = stripConfiguredGridOfficeOps(meta)
  const strippedRouting = routingWithoutGrid(row.provider_routing)
  const routingChanged = parseRouting(row.provider_routing).length !== strippedRouting.length
  const metaChanged = JSON.stringify(strippedMeta) !== JSON.stringify(meta)
  if (!routingChanged && !metaChanged) return false

  const stillLive = isCustomerFacingFiatCorridorLive({
    enabled: row.enabled,
    provider_routing: strippedRouting,
    metadata: strippedMeta,
  })

  const { error: upErr } = await admin
    .from("payout_corridors")
    .update({
      metadata: strippedMeta,
      provider_routing: strippedRouting,
      enabled: stillLive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
  return !upErr
}

function stripGridFieldsSchema(fieldsSchema: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!fieldsSchema || typeof fieldsSchema !== "object") return fieldsSchema
  if (!("grid" in fieldsSchema)) return fieldsSchema
  return { ...fieldsSchema, grid: null }
}

export type GridMomoCorridorRealignResult = {
  ok: boolean
  realigned: number
  skipped: number
  error?: string
}

/**
 * Move Grid payout/pay-in/cross-border ops from bank_transfer rows to mobile_money
 * for corridors where Grid only supports mobile money (UGX, RWF, etc.).
 */
export async function realignGridMomoCorridorRouting(
  admin: SupabaseClient,
): Promise<GridMomoCorridorRealignResult> {
  const pairs = listGridMomoOnlyCorridorPairs()
  if (!pairs.length) return { ok: true, realigned: 0, skipped: 0 }

  const { data: rows, error } = await admin
    .from("payout_corridors")
    .select(
      "id,country_code,currency_code,rail,enabled,metadata,provider_routing,fields_schema,country_name",
    )

  if (error) return { ok: false, realigned: 0, skipped: 0, error: error.message }

  const byKey = new Map<string, CorridorRow>()
  for (const row of (rows ?? []) as CorridorRow[]) {
    const key = `${String(row.country_code).toUpperCase()}:${String(row.currency_code).toUpperCase()}:${row.rail}`
    byKey.set(key, row)
  }

  let realigned = 0
  let skipped = 0

  for (const pair of pairs) {
    if (!isGridMomoOnlyCorridor(pair.countryCode, pair.currencyCode)) {
      skipped++
      continue
    }

    const bankKey = `${pair.countryCode}:${pair.currencyCode}:bank_transfer`
    const momoKey = `${pair.countryCode}:${pair.currencyCode}:mobile_money`
    const bank = byKey.get(bankKey)
    let mobile = byKey.get(momoKey)
    const bankMeta = bank ? rowMetadata(bank) : {}

    if (!bank || !bankRowHasGridOps(bankMeta)) {
      let changed = false
      if (bank && rowHasOrphanGridRouting(bank)) {
        if (await clearStaleGridOfficeOpsOnRow(admin, bank)) changed = true
      }
      if (!mobile) {
        const countryName = countryDisplayName(pair.countryCode) || pair.countryCode
        const result = await upsertPayoutCorridor(admin, {
          rail: "mobile_money",
          country_code: pair.countryCode,
          country_name: countryName,
          currency_code: pair.currencyCode,
          currency_name: currencyDisplayName(pair.currencyCode),
          enabled: false,
          metadata: { grid_send: true, grid_receive: true },
        })
        if (!result.ok) {
          skipped++
          continue
        }
        changed = true
      } else if (rowHasOrphanGridRouting(mobile)) {
        if (await clearStaleGridOfficeOpsOnRow(admin, mobile)) changed = true
      }
      if (changed) realigned++
      else skipped++
      continue
    }

    if (!mobile) {
      const countryName =
        bank.country_name?.trim() || countryDisplayName(pair.countryCode) || pair.countryCode
      const insert = await upsertPayoutCorridor(admin, {
        rail: "mobile_money",
        country_code: pair.countryCode,
        country_name: countryName,
        currency_code: pair.currencyCode,
        currency_name: currencyDisplayName(pair.currencyCode),
        enabled: bank.enabled ?? false,
        provider_routing: mergeGridRouting([], true),
        metadata: applyGridOpsFromBankToMobile(bankMeta, { grid_send: true, grid_receive: true }),
      })
      if (!insert.ok) {
        skipped++
        continue
      }
      const { data: created } = await admin
        .from("payout_corridors")
        .select("id")
        .eq("rail", "mobile_money")
        .eq("country_code", pair.countryCode)
        .eq("currency_code", pair.currencyCode)
        .maybeSingle()
      if (created?.id) {
        mobile = {
          id: created.id,
          country_code: pair.countryCode,
          currency_code: pair.currencyCode,
          rail: "mobile_money",
          enabled: bank.enabled,
          metadata: applyGridOpsFromBankToMobile(bankMeta, { grid_send: true, grid_receive: true }),
          provider_routing: mergeGridRouting([], true),
          fields_schema: null,
          country_name: countryName,
        }
        byKey.set(momoKey, mobile)
      }
    }

    if (!mobile) {
      skipped++
      continue
    }

    const mobileMeta = applyGridOpsFromBankToMobile(bankMeta, rowMetadata(mobile))
    const mobileRouting = mergeGridRouting(
      mobile.provider_routing,
      gridWasPrimaryRouting(bank.provider_routing),
    )

    const { error: mobileErr } = await admin
      .from("payout_corridors")
      .update({
        metadata: mobileMeta,
        provider_routing: mobileRouting,
        enabled: mobile.enabled || bank.enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", mobile.id)
    if (mobileErr) {
      skipped++
      continue
    }

    const strippedBankMeta = stripGridOps(bankMeta)
    const strippedBankRouting = routingWithoutGrid(bank.provider_routing)
    const strippedFields = stripGridFieldsSchema(bank.fields_schema)
    const bankStillLive = isCustomerFacingFiatCorridorLive({
      enabled: bank.enabled,
      provider_routing: strippedBankRouting,
      metadata: strippedBankMeta,
    })

    const { error: bankErr } = await admin
      .from("payout_corridors")
      .update({
        metadata: strippedBankMeta,
        provider_routing: strippedBankRouting,
        fields_schema: strippedFields,
        enabled: bankStillLive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bank.id)
    if (bankErr) {
      skipped++
      continue
    }

    realigned++
  }

  return { ok: true, realigned, skipped }
}

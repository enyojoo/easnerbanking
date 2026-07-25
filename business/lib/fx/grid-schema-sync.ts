import type { SupabaseClient } from "@supabase/supabase-js"
import {
  isNestedPayoutFieldsSchema,
  unwrapNoahFieldsSchema,
  unwrapYcFieldsSchema,
  type GridCorridorSchemaHint,
} from "@easner/shared"
import type { AllCorridorSchemaSyncResult } from "@/lib/fx/provider-schema-sync-types"
import { syncNoahCorridorSchemasSafe } from "@/lib/fx/noah-schema-sync"
import { syncYcCorridorSchemasSafe } from "@/lib/fx/yc-schema-sync"
import { isMomoGridDiscovery, listGridDiscoveries } from "@/lib/grid/discoveries"
import type { GridDiscovery } from "@/lib/grid/types"

function corridorUsesGrid(row: {
  provider_routing?: unknown
  metadata?: unknown
}): boolean {
  const routing = Array.isArray(row.provider_routing) ? row.provider_routing : []
  if (routing.some((e) => String((e as { provider?: string }).provider ?? "").toLowerCase() === "grid")) {
    return true
  }
  const meta = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {}
  return meta.grid_send === true || meta.grid_receive === true
}

function discoveryLabel(d: GridDiscovery): string {
  return String(d.displayName ?? d.bankName ?? "").trim()
}

function discoveryValue(d: GridDiscovery): string {
  return String(d.bankName ?? d.displayName ?? "").trim()
}

export function buildGridSchemaFromDiscoveries(input: {
  discoveries: GridDiscovery[]
  countryCode: string
  currencyCode: string
  rail: "bank_transfer" | "mobile_money"
}): GridCorridorSchemaHint | null {
  const country = input.countryCode.trim().toUpperCase()
  const currency = input.currencyCode.trim().toUpperCase()
  const filtered = input.discoveries.filter((d) => {
    const dCountry = String(d.country ?? "").trim().toUpperCase()
    const dCurrency = String(d.currency ?? "").trim().toUpperCase()
    return (!dCountry || dCountry === country) && (!dCurrency || dCurrency === currency)
  })

  if (!filtered.length) return null

  if (input.rail === "mobile_money") {
    const momo = filtered
      .filter((d) => isMomoGridDiscovery(d) || !filtered.some((x) => !isMomoGridDiscovery(x)))
      .map((d) => ({ value: discoveryValue(d), label: discoveryLabel(d) || discoveryValue(d) }))
      .filter((e) => e.value)
    const unique = [...new Map(momo.map((e) => [e.value, e])).values()]
    if (!unique.length) return null
    return {
      status: "ready",
      channel_type: "momo",
      momo_provider_enum: unique,
      note: "Synced from Grid discoveries",
    }
  }

  const banks = filtered
    .filter((d) => !isMomoGridDiscovery(d))
    .map((d) => discoveryValue(d))
    .filter(Boolean)
  const uniqueBanks = [...new Set(banks)]
  if (!uniqueBanks.length) {
    const fallback = filtered.map((d) => discoveryValue(d)).filter(Boolean)
    const uniqueFallback = [...new Set(fallback)]
    if (!uniqueFallback.length) return null
    return {
      status: "ready",
      channel_type: "bank",
      bank_enum: uniqueFallback,
      note: "Synced from Grid discoveries",
    }
  }
  return {
    status: "ready",
    channel_type: "bank",
    bank_enum: uniqueBanks,
    note: "Synced from Grid discoveries",
  }
}

export type GridSchemaSyncResult = {
  ok: boolean
  updated: number
  skipped: number
  error?: string
}

export async function syncGridCorridorSchemas(
  admin: SupabaseClient,
  opts?: { forceRefresh?: boolean },
): Promise<GridSchemaSyncResult> {
  const { data: rows, error } = await admin
    .from("payout_corridors")
    .select("id,country_code,currency_code,rail,fields_schema,metadata,provider_routing,providers")

  if (error) return { ok: false, updated: 0, skipped: 0, error: error.message }

  const targets = (rows ?? []).filter((row) => corridorUsesGrid(row))
  if (!targets.length) return { ok: true, updated: 0, skipped: 0 }

  const discoveries = await listGridDiscoveries(opts?.forceRefresh ?? true)
  let updated = 0
  let skipped = 0

  for (const row of targets) {
    const cc = String(row.country_code ?? "").trim().toUpperCase()
    const cur = String(row.currency_code ?? "").trim().toUpperCase()
    const rail = row.rail === "mobile_money" ? "mobile_money" : "bank_transfer"

    const gridSchema = buildGridSchemaFromDiscoveries({
      discoveries,
      countryCode: cc,
      currencyCode: cur,
      rail,
    })
    if (!gridSchema) {
      skipped++
      continue
    }

    const prior = row.fields_schema
    const priorNoah = isNestedPayoutFieldsSchema(prior) ? prior.noah : unwrapNoahFieldsSchema(prior)
    const priorYc = unwrapYcFieldsSchema(prior)
    const fieldsSchema = {
      noah: priorNoah ?? null,
      yellowcard: priorYc ?? null,
      grid: gridSchema,
    }

    const updates: Record<string, unknown> = { fields_schema: fieldsSchema }
    if (rail === "mobile_money" && gridSchema.momo_provider_enum?.length) {
      updates.providers = gridSchema.momo_provider_enum.map((e) => e.label || e.value)
    }

    const { error: upErr } = await admin.from("payout_corridors").update(updates).eq("id", row.id)
    if (upErr) {
      skipped++
      continue
    }
    updated++
  }

  return { ok: true, updated, skipped }
}

export async function syncAllCorridorSchemasSafe(
  admin: SupabaseClient,
): Promise<AllCorridorSchemaSyncResult> {
  const emptySchemas = {
    noah: { updated: 0, skipped: 0 },
    yellowcard: { updated: 0, skipped: 0 },
    grid: { updated: 0, skipped: 0 },
  }

  try {
    const { syncGridPayoutCorridorsSafe } = await import("@/lib/fx/grid-corridor-sync")
    const { syncYcPayoutCorridorsSafe } = await import("@/lib/fx/yc-corridor-sync")

    const gridProvision = await syncGridPayoutCorridorsSafe(admin, { forceRefresh: true })
    if (!gridProvision.ok) {
      return { ok: false, provision: gridProvision, schemas: emptySchemas, error: gridProvision.error }
    }

    const ycProvision = await syncYcPayoutCorridorsSafe(admin)
    if (!ycProvision.ok) {
      return { ok: false, provision: gridProvision, schemas: emptySchemas, error: ycProvision.error }
    }

    const noah = await syncNoahCorridorSchemasSafe(admin)
    if (!noah.ok) {
      return { ok: false, provision: gridProvision, schemas: emptySchemas, error: noah.error }
    }

    const yellowcard = await syncYcCorridorSchemasSafe(admin)
    if (!yellowcard.ok) {
      return { ok: false, provision: gridProvision, schemas: emptySchemas, error: yellowcard.error }
    }

    const grid = await syncGridCorridorSchemas(admin, { forceRefresh: true })
    if (!grid.ok) {
      return { ok: false, provision: gridProvision, schemas: emptySchemas, error: grid.error }
    }

    return {
      ok: true,
      provision: gridProvision,
      schemas: {
        noah: { updated: noah.updated, skipped: noah.skipped },
        yellowcard: { updated: yellowcard.updated, skipped: yellowcard.skipped },
        grid: { updated: grid.updated, skipped: grid.skipped },
      },
    }
  } catch (e) {
    return {
      ok: false,
      schemas: emptySchemas,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/** Full corridor sync: provision Grid/YC rows, then refresh Noah, YC, and Grid field schemas. */
export async function syncGridCorridorSchemasSafe(
  admin: SupabaseClient,
): Promise<AllCorridorSchemaSyncResult> {
  return syncAllCorridorSchemasSafe(admin)
}

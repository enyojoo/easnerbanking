import type { SupabaseClient } from "@supabase/supabase-js"
import {
  mergeYcNetworksIntoSchema,
  synthesizeYcSchemaFromNoah,
  unwrapGridFieldsSchema,
  unwrapNoahFieldsSchema,
  YC_STATIC_CORRIDOR_SCHEMAS,
  ycCorridorSchemaKey,
  type YcCorridorSchemaHint,
} from "@easner/shared"
import { listYellowcardNetworks } from "@/lib/yellowcard/networks"
import type { ProviderSchemaSyncResult } from "@/lib/fx/provider-schema-sync-types"
import { mergeCorridorProvidersColumn } from "@/lib/fx/corridor-providers-merge"

const LATAM = new Set(["MX", "BR", "AR", "CO", "CL", "PE"])

function corridorUsesYc(row: {
  metadata?: unknown
  provider_routing?: unknown
}): boolean {
  const routing = Array.isArray(row.provider_routing) ? row.provider_routing : []
  if (routing.some((e) => String((e as { provider?: string }).provider ?? "").toLowerCase() === "yellowcard")) {
    return true
  }
  const meta = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {}
  return meta.yc_send === true || meta.yc_receive === true
}

function genericBankSchema(countryCode: string, currencyCode: string): YcCorridorSchemaHint {
  return {
    status: "ready",
    channel_type: "bank",
    account_number_label: "Account number",
    extra_fields: [],
    note: `Generic YC bank schema for ${countryCode}/${currencyCode}`,
  }
}

function momoLabelsFromProviders(providers: unknown): { value: string; label: string }[] {
  if (!Array.isArray(providers)) return []
  return [...new Set(providers.map((p) => String(p ?? "").trim()).filter(Boolean))].map((label) => ({
    value: label,
    label,
  }))
}

async function buildYcMomoSchema(input: {
  providers?: unknown
  fieldsSchema?: unknown
  countryCode: string
  currencyCode: string
}): Promise<YcCorridorSchemaHint | null> {
  const momoMap = new Map<string, { value: string; label: string }>()
  for (const entry of momoLabelsFromProviders(input.providers)) {
    momoMap.set(entry.value.toLowerCase(), entry)
  }
  const noah = unwrapNoahFieldsSchema(input.fieldsSchema)
  for (const label of noah?.mobile_provider_labels ?? []) {
    const trimmed = String(label).trim()
    if (trimmed) momoMap.set(trimmed.toLowerCase(), { value: trimmed, label: trimmed })
  }
  const grid = unwrapGridFieldsSchema(input.fieldsSchema)
  for (const entry of grid?.momo_provider_enum ?? []) {
    const value = String(entry.value ?? "").trim()
    if (!value) continue
    momoMap.set(value.toLowerCase(), {
      value,
      label: String(entry.label ?? value).trim() || value,
    })
  }

  const cc = input.countryCode.trim().toUpperCase()
  const cur = input.currencyCode.trim().toUpperCase()

  try {
    const networks = await listYellowcardNetworks({ country: cc, currency: cur })
    for (const network of networks) {
      const name = String(network.name ?? network.code ?? "").trim()
      if (!name) continue
      if (!/mobile|momo|m-pesa|mpesa|airtel|mtn|orange|wave|vodafone|tigo|tnm/i.test(name)) {
        continue
      }
      momoMap.set(name.toLowerCase(), { value: name, label: name })
    }
  } catch {
    // keep corridor-derived momo labels
  }

  const momo = [...momoMap.values()]
  if (!momo.length) return null
  return {
    status: "ready",
    channel_type: "momo",
    momo_provider_enum: momo,
    note: "Synced from YC/Noah/Grid MoMo sources",
  }
}

function nestedFieldsSchema(
  prior: unknown,
  yellowcard: YcCorridorSchemaHint,
): { noah: unknown; yellowcard: YcCorridorSchemaHint; grid: unknown } {
  const priorNoah = unwrapNoahFieldsSchema(prior)
  const priorGrid = unwrapGridFieldsSchema(prior)
  return {
    noah: priorNoah ?? null,
    yellowcard,
    grid: priorGrid ?? null,
  }
}

/** Refresh fields_schema.yellowcard from static maps, Noah hints, and YC networks. */
export async function syncYcCorridorSchemas(admin: SupabaseClient): Promise<ProviderSchemaSyncResult> {
  const { data: rows, error } = await admin
    .from("payout_corridors")
    .select("id,country_code,currency_code,rail,fields_schema,metadata,provider_routing,providers")

  if (error) return { ok: false, updated: 0, skipped: 0, error: error.message }

  const targets = (rows ?? []).filter((row) => corridorUsesYc(row))
  if (!targets.length) return { ok: true, updated: 0, skipped: 0 }

  let updated = 0
  let skipped = 0

  for (const row of targets) {
    const cc = String(row.country_code ?? "").trim().toUpperCase()
    const cur = String(row.currency_code ?? "").trim().toUpperCase()
    const rail = row.rail === "mobile_money" ? "mobile_money" : "bank_transfer"
    const key = ycCorridorSchemaKey(cc, cur)

    let ycSchema: YcCorridorSchemaHint | null = null

    if (rail === "mobile_money") {
      ycSchema = await buildYcMomoSchema({
        providers: row.providers,
        fieldsSchema: row.fields_schema,
        countryCode: cc,
        currencyCode: cur,
      })
    } else {
      ycSchema =
        YC_STATIC_CORRIDOR_SCHEMAS[key] ??
        synthesizeYcSchemaFromNoah(unwrapNoahFieldsSchema(row.fields_schema)) ??
        genericBankSchema(cc, cur)

      try {
        const networks = await listYellowcardNetworks({ country: cc, currency: cur })
        if (networks.length > 0) {
          ycSchema = mergeYcNetworksIntoSchema(ycSchema, networks)
        }
      } catch {
        // keep synthesized schema
      }
    }

    if (!ycSchema) {
      skipped++
      continue
    }

    const fields_schema = nestedFieldsSchema(row.fields_schema, {
      ...ycSchema,
      status: "ready",
    })

    const priorMeta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? { ...(row.metadata as Record<string, unknown>) }
        : {}
    const metadata = {
      ...priorMeta,
      schema_ready: true,
      schema_synced_at: new Date().toISOString(),
      ...(LATAM.has(cc) ? { latam_yc_only: true } : {}),
    }

    const updates: Record<string, unknown> = {
      fields_schema,
      metadata,
      updated_at: new Date().toISOString(),
    }

    if (rail === "mobile_money" && ycSchema.momo_provider_enum?.length) {
      updates.providers = mergeCorridorProvidersColumn(
        row.providers,
        ycSchema.momo_provider_enum.map((e) => e.label || e.value),
      )
    }

    const { error: upErr } = await admin.from("payout_corridors").update(updates).eq("id", row.id)
    if (upErr) skipped++
    else updated++
  }

  return { ok: true, updated, skipped }
}

export async function syncYcCorridorSchemasSafe(
  admin: SupabaseClient,
): Promise<ProviderSchemaSyncResult> {
  try {
    return await syncYcCorridorSchemas(admin)
  } catch (e) {
    return {
      ok: false,
      updated: 0,
      skipped: 0,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  mergeYcMomoNetworksIntoSchema,
  mergeYcNetworksIntoSchema,
  resolvePrimaryPayoutProvider,
  synthesizeYcSchemaFromNoah,
  unwrapGridFieldsSchema,
  unwrapNoahFieldsSchema,
  YC_STATIC_CORRIDOR_SCHEMAS,
  ycCorridorSchemaKey,
  type YcCorridorSchemaHint,
} from "@easner/shared"
import { listYellowcardNetworks } from "@/lib/yellowcard/networks"
import { findYcCorridorChannel } from "@/lib/payout-providers/yellowcard-provider"
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

async function buildYcMomoSchema(input: {
  countryCode: string
  currencyCode: string
}): Promise<YcCorridorSchemaHint> {
  const cc = input.countryCode.trim().toUpperCase()
  const cur = input.currencyCode.trim().toUpperCase()
  const networks = await listYellowcardNetworks({ country: cc, currency: cur })
  const sendChannel = await findYcCorridorChannel({
    countryCode: cc,
    currencyCode: cur,
    rail: "mobile_money",
    includeInactive: true,
    networks,
  })
  const channelId = String(sendChannel?.id ?? sendChannel?.channelId ?? "").trim()
  return mergeYcMomoNetworksIntoSchema(
    {
      status: "ready",
      channel_type: "momo",
      extra_fields: [],
    },
    networks,
    { channelId },
  )
}

function nestedFieldsSchema(
  prior: unknown,
  yellowcard: YcCorridorSchemaHint,
  stripNoahProviderLists: boolean,
): { noah: unknown; yellowcard: YcCorridorSchemaHint; grid: unknown } {
  const priorNoah = unwrapNoahFieldsSchema(prior)
  let noah: unknown = priorNoah ?? null
  if (stripNoahProviderLists && priorNoah && typeof priorNoah === "object") {
    const rest = { ...(priorNoah as Record<string, unknown>) }
    delete rest.bank_enum
    delete rest.mobile_provider_labels
    noah = rest
  }
  const priorGrid = unwrapGridFieldsSchema(prior)
  return {
    noah,
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

  const countryFilter = new Set(
    String(process.env.YC_SCHEMA_SYNC_COUNTRY ?? "")
      .split(",")
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean),
  )
  const targets = (rows ?? []).filter((row) => {
    if (!corridorUsesYc(row)) return false
    if (!countryFilter.size) return true
    return countryFilter.has(String(row.country_code ?? "").trim().toUpperCase())
  })
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
      try {
        ycSchema = await buildYcMomoSchema({
          countryCode: cc,
          currencyCode: cur,
        })
      } catch {
        ycSchema = {
          status: "ready",
          channel_type: "momo",
          momo_provider_enum: [],
          extra_fields: [],
        }
      }
    } else {
      ycSchema =
        YC_STATIC_CORRIDOR_SCHEMAS[key] ??
        synthesizeYcSchemaFromNoah(unwrapNoahFieldsSchema(row.fields_schema)) ??
        genericBankSchema(cc, cur)

      try {
        const sendChannel = await findYcCorridorChannel({
          countryCode: cc,
          currencyCode: cur,
          rail,
          includeInactive: true,
        })
        const channelId = String(sendChannel?.id ?? sendChannel?.channelId ?? "").trim()
        const networks = await listYellowcardNetworks({ country: cc, currency: cur })
        if (networks.length > 0) {
          ycSchema = mergeYcNetworksIntoSchema(ycSchema, networks, { channelId })
        }
      } catch {
        // keep synthesized schema
      }
    }

    if (!ycSchema) {
      skipped++
      continue
    }

    const fields_schema = nestedFieldsSchema(
      row.fields_schema,
      {
        ...ycSchema,
        status: "ready",
      },
      resolvePrimaryPayoutProvider(row.provider_routing) === "yellowcard",
    )

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

    if (rail === "mobile_money") {
      const labels = (ycSchema.momo_provider_enum ?? [])
        .map((e) => String(e.label || e.value || "").trim())
        .filter(Boolean)
      updates.providers =
        resolvePrimaryPayoutProvider(row.provider_routing) === "yellowcard"
          ? [...new Set(labels)].sort((a, b) => a.localeCompare(b))
          : mergeCorridorProvidersColumn(row.providers, labels)
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

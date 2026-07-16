/**
 * Sync YC corridor field schemas into payout_corridors.fields_schema.yellowcard.
 * Preserves existing fields_schema.noah. Enables LatAm corridors when schema is ready.
 *
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/sync-yc-corridor-schemas.ts
 */
import { createClient } from "@supabase/supabase-js"
import {
  mergeYcNetworksIntoSchema,
  synthesizeYcSchemaFromNoah,
  unwrapNoahFieldsSchema,
  YC_STATIC_CORRIDOR_SCHEMAS,
  ycCorridorSchemaKey,
  type YcCorridorSchemaHint,
} from "@easner/shared"
import { listYellowcardNetworks } from "../lib/yellowcard/networks"

const LATAM = new Set(["MX", "BR", "AR", "CO", "CL", "PE"])

function corridorUsesYcSend(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false
  return Boolean((metadata as { yc_send?: boolean }).yc_send)
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

async function main() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!supabaseUrl || !serviceRoleKey) throw new Error("supabase_not_configured")

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: rows, error } = await admin
    .from("payout_corridors")
    .select("id,country_code,currency_code,rail,fields_schema,metadata,enabled")
    .eq("rail", "bank_transfer")

  if (error) throw error

  const targetRows = (rows ?? []).filter((row) => {
    const cc = String(row.country_code || "").trim().toUpperCase()
    return LATAM.has(cc) || corridorUsesYcSend(row.metadata)
  })

  let updated = 0
  let networksFetched = 0

  for (const row of targetRows) {
    const cc = String(row.country_code || "").trim().toUpperCase()
    const cur = String(row.currency_code || "").trim().toUpperCase()
    const key = ycCorridorSchemaKey(cc, cur)

    let ycSchema: YcCorridorSchemaHint =
      YC_STATIC_CORRIDOR_SCHEMAS[key] ??
      synthesizeYcSchemaFromNoah(unwrapNoahFieldsSchema(row.fields_schema)) ??
      genericBankSchema(cc, cur)

    try {
      const networks = await listYellowcardNetworks({ country: cc, currency: cur })
      if (networks.length > 0) {
        ycSchema = mergeYcNetworksIntoSchema(ycSchema, networks)
        networksFetched++
      }
    } catch (e) {
      console.warn(`networks_fetch_failed ${key}:`, e instanceof Error ? e.message : e)
    }

    const priorNoah = unwrapNoahFieldsSchema(row.fields_schema)
    const fieldsSchema = {
      ...(priorNoah ? { noah: priorNoah } : {}),
      yellowcard: {
        ...ycSchema,
        status: "ready" as const,
      },
    }

    const metadata = {
      ...((row.metadata as object) ?? {}),
      latam_yc_only: true,
      schema_ready: true,
      schema_synced_at: new Date().toISOString(),
    }

    const { error: upErr } = await admin
      .from("payout_corridors")
      .update({
        fields_schema: fieldsSchema,
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)

    if (upErr) throw upErr
    updated++
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        updated,
        networksFetched,
        note: "LatAm YC schemas synced; corridors left enabled/disabled as-is",
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

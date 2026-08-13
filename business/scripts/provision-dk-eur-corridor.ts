/**
 * Provision DK:EUR bank_transfer with Noah + Grid payout routing.
 * Denmark has one bank_transfer row (unique on country+rail); migrates DKK → EUR for SEPA.
 *
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/provision-dk-eur-corridor.ts
 */
import { createClient } from "@supabase/supabase-js"
import { currencyDisplayName } from "@easner/shared"
import { syncGridCorridorSchemas } from "../lib/fx/grid-schema-sync"
import { syncNoahCorridorSchemas } from "../lib/fx/noah-schema-sync"
import { hasNoahSellChannel } from "../lib/noah/channel-availability"
import { gridDiscoverySupportsCorridor, listGridDiscoveries } from "../lib/grid/discoveries"

const ROUTING = [
  { provider: "noah", priority: 1, settlement_asset: "USDC" },
  { provider: "grid", priority: 2, settlement_asset: "USDC" },
]

async function main() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!supabaseUrl || !serviceRoleKey) throw new Error("supabase_not_configured")

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const [noahOk, discoveries] = await Promise.all([
    hasNoahSellChannel({ country: "DK", fiatCurrency: "EUR" }),
    listGridDiscoveries(true),
  ])
  const gridOk = gridDiscoverySupportsCorridor({
    discoveries,
    countryCode: "DK",
    currencyCode: "EUR",
    rail: "bank_transfer",
  })
  if (!noahOk || !gridOk) {
    throw new Error(`provider_precheck_failed noah=${noahOk} grid=${gridOk}`)
  }

  const { data: existing, error: findErr } = await admin
    .from("payout_corridors")
    .select("id,currency_code")
    .eq("country_code", "DK")
    .eq("rail", "bank_transfer")
    .maybeSingle()

  if (findErr) throw new Error(findErr.message)
  if (!existing?.id) throw new Error("dk_bank_row_missing")

  const { data: priorRow, error: priorErr } = await admin
    .from("payout_corridors")
    .select("metadata")
    .eq("id", existing.id)
    .maybeSingle()
  if (priorErr) throw new Error(priorErr.message)

  const meta = {
    ...((priorRow?.metadata as Record<string, unknown> | null) ?? {}),
    grid_send: true,
    grid_receive: true,
  }
  delete meta.grid_send_enabled
  delete meta.grid_receive_enabled
  delete meta.cross_border_enabled
  delete meta.cross_border_provider

  const { error: upErr } = await admin
    .from("payout_corridors")
    .update({
      currency_code: "EUR",
      currency_name: currencyDisplayName("EUR"),
      enabled: false,
      provider_routing: ROUTING,
      metadata: meta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id)

  if (upErr) throw new Error(upErr.message)

  const [gridSchemas, noahSchemas] = await Promise.all([
    syncGridCorridorSchemas(admin, { forceRefresh: true }),
    syncNoahCorridorSchemas(admin),
  ])
  if (!gridSchemas.ok) throw new Error(gridSchemas.error ?? "grid_schema_sync_failed")
  if (!noahSchemas.ok) throw new Error(noahSchemas.error ?? "noah_schema_sync_failed")

  const { data: row } = await admin
    .from("payout_corridors")
    .select("country_code,currency_code,rail,enabled,provider_routing,metadata,fields_schema")
    .eq("id", existing.id)
    .maybeSingle()

  console.log("provisioned DK:EUR bank_transfer")
  console.log(`  migrated_from: ${existing.currency_code} → EUR`)
  console.log("  enabled:", row?.enabled)
  console.log("  routing:", JSON.stringify(row?.provider_routing))
  console.log("  grid_send:", row?.metadata?.grid_send, "grid_receive:", row?.metadata?.grid_receive)
  const fs = row?.fields_schema as Record<string, unknown> | null
  console.log("  schemas:", fs ? Object.keys(fs).filter((k) => fs[k] != null).join(", ") : "(none)")
  console.log(
    `  schema_sync grid_updated=${gridSchemas.updated} noah_updated=${noahSchemas.updated}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

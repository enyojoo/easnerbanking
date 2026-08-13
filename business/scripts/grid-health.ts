/**
 * Grid ops health: schemas, Office coverage, live-filter orphans, inbox errors, stuck transfers, stale flags.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/grid-health.ts
 */
import { createClient } from "@supabase/supabase-js"
import {
  GRID_STATIC_CORRIDOR_SCHEMAS,
  isCustomerFacingFiatCorridorLive,
} from "@easner/shared"
import { listGridDiscoveries, gridDiscoverySupportsCorridor } from "../lib/grid/discoveries"
import { buildGridCorridorSchema } from "../lib/fx/grid-schema-sync"
import { collectGridCorridorTargets } from "../lib/fx/grid-corridor-sync"
import { isGridConfigured } from "../lib/grid/config"
import { buildSendDestinationsCatalog } from "../lib/send-destinations/build-catalog"

function rowKey(country: string, currency: string, rail: string) {
  return `${country.toUpperCase()}:${currency.toUpperCase()}:${rail}`
}

const LIVE_FLAGS = [
  "grid_send_enabled",
  "grid_receive_enabled",
  "yc_send_enabled",
  "yc_receive_enabled",
]

async function main() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!supabaseUrl || !serviceRoleKey) throw new Error("supabase_not_configured")

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: corridors } = await admin
    .from("payout_corridors")
    .select("country_code,currency_code,rail,enabled,metadata,fields_schema,provider_routing")

  const rows = corridors ?? []
  let staleFlagCount = 0
  for (const row of rows) {
    if (row.enabled) continue
    const meta = (row.metadata ?? {}) as Record<string, unknown>
    if (LIVE_FLAGS.some((k) => meta[k] === true)) staleFlagCount++
  }

  let liveOrphans = 0
  for (const row of rows.filter((r) => r.enabled)) {
    const live = isCustomerFacingFiatCorridorLive({
      enabled: row.enabled,
      provider_routing: row.provider_routing,
      metadata: row.metadata,
    })
    if (!live) liveOrphans++
  }

  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
  const { count: inboxErrors } = await admin
    .from("event_inbox")
    .select("event_id", { count: "exact", head: true })
    .eq("provider", "grid")
    .eq("status", "failed")
    .gte("received_at", since)

  const { count: stuckTransfers } = await admin
    .from("grid_transfers")
    .select("id", { count: "exact", head: true })
    .in("mode", ["fund_balance", "cross_border_send"])
    .in("status", ["pending", "awaiting_pay_in", "processing"])

  let discoveries: Awaited<ReturnType<typeof listGridDiscoveries>> = []
  let schemaBuildMissing: unknown[] = []
  let missingOfficeRows: string[] = []
  let catalog: { RW?: { bank: number; mobile: number }; UG?: { bank: number; mobile: number } } = {}

  if (isGridConfigured()) {
    try {
      discoveries = await listGridDiscoveries(true)
      const targets = collectGridCorridorTargets({ discoveries })
      const officeRowKeys = new Set(rows.map((r) => rowKey(r.country_code, r.currency_code, r.rail)))
      missingOfficeRows = targets
        .filter((t) => !officeRowKeys.has(rowKey(t.countryCode, t.currencyCode, t.rail)))
        .map((t) => rowKey(t.countryCode, t.currencyCode, t.rail))
        .sort()

      const gridRows = rows.filter((r) => {
        const m = (r.metadata ?? {}) as Record<string, unknown>
        return m.grid_send === true || m.grid_receive === true
      })
      for (const row of gridRows) {
        const cc = String(row.country_code ?? "").toUpperCase()
        const cur = String(row.currency_code ?? "").toUpperCase()
        const rail = row.rail === "mobile_money" ? "mobile_money" : "bank_transfer"
        const schema = buildGridCorridorSchema({
          discoveries,
          countryCode: cc,
          currencyCode: cur,
          rail,
          fieldsSchema: row.fields_schema,
        })
        const gridFs = (row.fields_schema as { grid?: { status?: string } } | null)?.grid
        if (!schema || gridFs?.status !== "ready") {
          schemaBuildMissing.push({ cc, cur, rail, supported: gridDiscoverySupportsCorridor({ discoveries, countryCode: cc, currencyCode: cur, rail }) })
        }
      }
    } catch (e) {
      schemaBuildMissing.push({ error: e instanceof Error ? e.message : String(e) })
    }
  }

  try {
    const { body } = await buildSendDestinationsCatalog({ annotateProviders: true })
    catalog = {
      RW: {
        bank: body.fiat.bank_transfer.filter((c) => c.country_code === "RW").length,
        mobile: body.fiat.mobile_money.filter((c) => c.country_code === "RW").length,
      },
      UG: {
        bank: body.fiat.bank_transfer.filter((c) => c.country_code === "UG").length,
        mobile: body.fiat.mobile_money.filter((c) => c.country_code === "UG").length,
      },
    }
  } catch {
    catalog = {}
  }

  const report = {
    discoveryCount: discoveries.length,
    staticCorridorCount: Object.keys(GRID_STATIC_CORRIDOR_SCHEMAS).length,
    schemaBuildMissing,
    missingOfficeRows,
    liveOrphans,
    staleFlagCount,
    eventInboxGridErrors24h: inboxErrors ?? 0,
    stuckGridTransfers: stuckTransfers ?? 0,
    catalog,
  }

  console.log(JSON.stringify(report, null, 2))
  console.log("")
  console.log("## Grid health")
  console.log(`- Discoveries: ${report.discoveryCount}`)
  console.log(`- Schema gaps: ${schemaBuildMissing.length}`)
  console.log(`- Missing Office rows: ${missingOfficeRows.length}`)
  console.log(`- Enabled orphans: ${liveOrphans}`)
  console.log(`- Stale live flags (disabled rows): ${staleFlagCount}`)
  console.log(`- Grid inbox errors (24h): ${report.eventInboxGridErrors24h}`)
  console.log(`- Stuck grid_transfers: ${report.stuckGridTransfers}`)
  if (catalog.UG) console.log(`- Catalog UG bank=${catalog.UG.bank} mobile=${catalog.UG.mobile}`)
  if (catalog.RW) console.log(`- Catalog RW bank=${catalog.RW.bank} mobile=${catalog.RW.mobile}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

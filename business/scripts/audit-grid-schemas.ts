/**
 * Audit Grid discoveries vs payout_corridor fields_schema.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/audit-grid-schemas.ts
 */
import { createClient } from "@supabase/supabase-js"
import { listGridDiscoveries, gridDiscoverySupportsCorridor } from "../lib/grid/discoveries"
import { buildGridCorridorSchema } from "../lib/fx/grid-schema-sync"

async function main() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!supabaseUrl || !serviceRoleKey) throw new Error("supabase_not_configured")

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const discoveries = await listGridDiscoveries(true)
  const { data: corridors } = await admin
    .from("payout_corridors")
    .select("country_code,currency_code,rail,enabled,metadata,fields_schema,provider_routing")
    .or("metadata->>grid_send.eq.true,metadata->>grid_receive.eq.true")

  const rows = corridors ?? []
  const unique = [...new Map(rows.map((r) => [`${r.country_code}:${r.currency_code}:${r.rail}`, r])).values()]

  const missing: unknown[] = []
  const ready: unknown[] = []
  for (const row of unique) {
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
    const hasReady = gridFs?.status === "ready"
    const supported = gridDiscoverySupportsCorridor({ discoveries, countryCode: cc, currencyCode: cur, rail })
    const discHits = discoveries.filter(
      (d) =>
        String(d.country ?? "").toUpperCase() === cc &&
        String(d.currency ?? "").toUpperCase() === cur,
    )
    const item = {
      cc,
      cur,
      rail,
      enabled: row.enabled,
      sendLive: row.metadata?.grid_send_enabled === true,
      recvLive: row.metadata?.grid_receive_enabled === true,
      hasReady,
      supported,
      discCount: discHits.length,
      discSample: discHits.slice(0, 3).map((d) => ({
        bank: d.bankName,
        display: d.displayName,
        rails: d.paymentRails,
      })),
    }
    if (!schema) missing.push(item)
    else ready.push(item)
  }

  const liveMissing = (missing as Array<{ sendLive?: boolean; recvLive?: boolean; hasReady?: boolean }>).filter(
    (r) => (r.sendLive || r.recvLive) && !r.hasReady,
  )

  console.log(
    JSON.stringify(
      {
        discoveryCount: discoveries.length,
        gridCorridors: unique.length,
        schemaBuildOk: ready.length,
        schemaBuildMissing: missing.length,
        liveEnabledMissingReadySchema: liveMissing,
        missing,
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

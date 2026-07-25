/**
 * Audit mobile_money corridors shown on fiat admin vs live provider MoMo support.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/audit-mobile-money-tab.ts
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { annotateAdminCorridorsWithProviderHealth } from "../lib/admin/annotate-payout-corridors"
import { corridorHasRailCapability } from "../lib/admin/corridor-rail-capability"
import { gridDiscoverySupportsCorridor, listGridDiscoveries } from "../lib/grid/discoveries"
import { getYcCorridorCapabilities } from "../lib/yellowcard/channel-availability"
import { hasNoahSellChannelForRail } from "../lib/noah/channel-availability"
import { countryDisplayName } from "@easner/shared"

function rowMetadata(row: { metadata?: unknown }) {
  return (row.metadata ?? {}) as Record<string, unknown>
}

async function main() {
  const admin = createSupabaseAdmin()
  const discoveries = await listGridDiscoveries(true)

  const { data: rows } = await admin
    .from("payout_corridors")
    .select("*")
    .eq("rail", "mobile_money")
    .order("country_name")

  const annotated = await annotateAdminCorridorsWithProviderHealth(rows ?? [])
  const visible = annotated.filter((r) => corridorHasRailCapability(r))

  console.log(`\n=== MOBILE MONEY TAB AUDIT ===`)
  console.log(`DB rows (mobile_money rail): ${annotated.length}`)
  console.log(`Visible on fiat admin tab: ${visible.length}\n`)

  console.log(
    "Country".padEnd(22),
    "CCY",
    "Visible",
    "Grid",
    "YC",
    "Noah",
    "GridLive",
    "YcLive",
    "NoahLive",
    "Configured",
  )
  console.log("-".repeat(100))

  for (const r of annotated.sort((a, b) => a.country_name.localeCompare(b.country_name))) {
    const meta = rowMetadata(r)
    const cc = r.country_code
    const cur = r.currency_code
    const visibleOnTab = corridorHasRailCapability(r)

    const gridLive = gridDiscoverySupportsCorridor({
      discoveries,
      countryCode: cc,
      currencyCode: cur,
      rail: "mobile_money",
    })
    const ycLive = await getYcCorridorCapabilities({ country: cc, currency: cur, rail: "mobile_money" })
    const ycLiveAny = ycLive.yc_send || ycLive.yc_receive
    const noahLive = await hasNoahSellChannelForRail({
      country: cc,
      fiatCurrency: cur,
      rail: "mobile_money",
    })

    const gridMeta = meta.grid_send === true || meta.grid_receive === true
    const ycMeta = meta.yc_send === true || meta.yc_receive === true
    const noahMeta = meta.noah_receive === true
    const configured =
      meta.grid_send_enabled === true ||
      meta.grid_receive_enabled === true ||
      meta.yc_send_enabled === true ||
      meta.yc_receive_enabled === true ||
      meta.noah_receive_enabled === true ||
      meta.noah_send_enabled === true

    const anyLiveMomo = gridLive || ycLiveAny || noahLive
    const flag = visibleOnTab && !anyLiveMomo ? " ⚠ NO LIVE MOMO" : ""
    const name = (r.country_name || countryDisplayName(cc)).slice(0, 20)

    console.log(
      name.padEnd(22),
      cur.padEnd(4),
      visibleOnTab ? "yes" : "no",
      gridMeta ? "Y" : "-",
      ycMeta ? "Y" : "-",
      noahMeta ? "Y" : "-",
      gridLive ? "Y" : "-",
      ycLiveAny ? "Y" : "-",
      noahLive ? "Y" : "-",
      configured ? "Y" : "-",
      flag,
    )
  }

  const visibleNoLive = visible.filter((r) => {
    const gridLive = gridDiscoverySupportsCorridor({
      discoveries,
      countryCode: r.country_code,
      currencyCode: r.currency_code,
      rail: "mobile_money",
    })
    return !gridLive && !r.yc_send_available && !r.yc_receive_available && !r.noah_sell_available
  })

  const visibleMetadataOnly = visible.filter((r) => {
    const gridLive = gridDiscoverySupportsCorridor({
      discoveries,
      countryCode: r.country_code,
      currencyCode: r.currency_code,
      rail: "mobile_money",
    })
    const meta = rowMetadata(r)
    const hasMeta = meta.grid_send === true || meta.grid_receive === true || meta.yc_send === true || meta.yc_receive === true
    return hasMeta && !gridLive && !r.yc_send_available && !r.yc_receive_available
  })

  console.log(`\n=== SUMMARY ===`)
  console.log(`Visible with NO live MoMo support: ${visibleNoLive.length}`)
  if (visibleNoLive.length) {
    for (const r of visibleNoLive) {
      console.log(`  ${r.country_code}:${r.currency_code} ${r.country_name}`)
    }
  }
  console.log(`Visible with metadata only (no live): ${visibleMetadataOnly.length}`)

  const gridMomoLive = visible.filter((r) =>
    gridDiscoverySupportsCorridor({
      discoveries,
      countryCode: r.country_code,
      currencyCode: r.currency_code,
      rail: "mobile_money",
    }),
  )
  console.log(`\nGrid live MoMo (${gridMomoLive.length}):`)
  for (const r of gridMomoLive) {
    console.log(`  ${r.country_code}:${r.currency_code} ${r.country_name}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

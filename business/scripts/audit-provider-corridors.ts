/**
 * Audit Noah, Yellowcard, and Grid corridor coverage vs payout_corridors.
 * Reports live provider capabilities (pay-in, payout, cross-border) and DB gaps.
 *
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/audit-provider-corridors.ts
 */
import { localPaymentCurrencyForCountry } from "@easner/shared"
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { hasNoahSellChannel } from "../lib/noah/channel-availability"
import { listYellowcardChannels } from "../lib/yellowcard/channels"
import {
  gridDiscoverySupportsCorridor,
  listGridDiscoveries,
} from "../lib/grid/discoveries"
import { collectGridCorridorTargets } from "../lib/fx/grid-corridor-sync"
import { fetchLiveGridExchangeRates } from "../lib/fx/grid-rates"
import { isExcludedPayoutCorridorCountry } from "../lib/payout-corridors-exclusions"

type Rail = "bank_transfer" | "mobile_money"

type LiveCaps = {
  noahPayout: boolean
  noahPayIn: boolean
  ycPayout: boolean
  ycPayIn: boolean
  gridPayout: boolean
  gridPayIn: boolean
}

type CorridorKey = `${string}:${string}:${Rail}`

function key(country: string, currency: string, rail: Rail): CorridorKey {
  return `${country.toUpperCase()}:${currency.toUpperCase()}:${rail}`
}

function parseKey(k: CorridorKey): { country: string; currency: string; rail: Rail } {
  const [country, currency, rail] = k.split(":") as [string, string, Rail]
  return { country, currency, rail }
}

function metaFlag(meta: Record<string, unknown>, name: string): boolean {
  return meta[name] === true
}

async function buildYcLiveMap(): Promise<Map<CorridorKey, { payout: boolean; payIn: boolean }>> {
  const map = new Map<CorridorKey, { payout: boolean; payIn: boolean }>()
  const channels = await listYellowcardChannels()
  for (const ch of channels) {
    if (ch.apiStatus !== "active" || ch.status !== "active") continue
    const country = String(ch.country ?? "").trim().toUpperCase()
    const currency = String(ch.currency ?? "").trim().toUpperCase()
    if (!country || !currency || isExcludedPayoutCorridorCountry(country)) continue
    const channelType = String(ch.channelType ?? "").toLowerCase()
    const rail: Rail = channelType.includes("momo") ? "mobile_money" : "bank_transfer"
    const ramp = String(ch.rampType ?? "").toLowerCase()
    const k = key(country, currency, rail)
    const existing = map.get(k) ?? { payout: false, payIn: false }
    if (ramp.includes("withdraw") || ramp.includes("send")) existing.payout = true
    if (ramp.includes("deposit") || ramp.includes("receive")) existing.payIn = true
    map.set(k, existing)
  }
  return map
}

async function buildGridLiveMap(
  discoveries: Awaited<ReturnType<typeof listGridDiscoveries>>,
): Promise<Map<CorridorKey, { payout: boolean; payIn: boolean }>> {
  const map = new Map<CorridorKey, { payout: boolean; payIn: boolean }>()
  const exchangeRates = await fetchLiveGridExchangeRates()
  const targets = collectGridCorridorTargets({ discoveries, exchangeRates })
  for (const t of targets) {
    const k = key(t.countryCode, t.currencyCode, t.rail)
    const discoveryOk = gridDiscoverySupportsCorridor({
      discoveries,
      countryCode: t.countryCode,
      currencyCode: t.currencyCode,
      rail: t.rail,
    })
    map.set(k, { payout: true, payIn: discoveryOk || t.rail === "bank_transfer" })
  }
  for (const d of discoveries) {
    const country = String(d.country ?? "").trim().toUpperCase()
    const currency = String(d.currency ?? "").trim().toUpperCase()
    if (!country || !currency || isExcludedPayoutCorridorCountry(country)) continue
    for (const rail of ["bank_transfer", "mobile_money"] as const) {
      if (
        !gridDiscoverySupportsCorridor({
          discoveries,
          countryCode: country,
          currencyCode: currency,
          rail,
        })
      ) {
        continue
      }
      const k = key(country, currency, rail)
      const existing = map.get(k) ?? { payout: false, payIn: false }
      existing.payout = true
      existing.payIn = true
      map.set(k, existing)
    }
  }
  return map
}

function crossBorderProviders(caps: LiveCaps): string[] {
  const out: string[] = []
  if (caps.ycPayout && caps.ycPayIn) out.push("yc")
  if (caps.gridPayout && caps.gridPayIn) out.push("grid")
  return out
}

function dbCrossBorderProviders(meta: Record<string, unknown>): string[] {
  const out: string[] = []
  if (metaFlag(meta, "yc_send") && metaFlag(meta, "yc_receive")) out.push("yc")
  if (metaFlag(meta, "grid_send") && metaFlag(meta, "grid_receive")) out.push("grid")
  return out
}

async function main() {
  const admin = createSupabaseAdmin()
  const [{ data: dbRows, error }, ycLive, discoveries] = await Promise.all([
    admin.from("payout_corridors").select("*").order("country_code"),
    buildYcLiveMap(),
    listGridDiscoveries(true),
  ])
  if (error) throw error

  const gridLive = await buildGridLiveMap(discoveries)

  const allKeys = new Set<CorridorKey>()
  for (const row of dbRows ?? []) {
    allKeys.add(key(String(row.country_code), String(row.currency_code), row.rail as Rail))
  }
  for (const k of ycLive.keys()) allKeys.add(k)
  for (const k of gridLive.keys()) allKeys.add(k)

  const missingInDb: Array<{ key: CorridorKey; live: LiveCaps }> = []
  const dbMissingLive: Array<{ key: CorridorKey; dbMeta: Record<string, unknown> }> = []
  const crossBorderGaps: string[] = []
  const momoGaps: string[] = []

  const summary = {
    live: {
      ycPayout: 0,
      ycPayIn: 0,
      ycCrossBorder: 0,
      gridPayout: 0,
      gridPayIn: 0,
      gridCrossBorder: 0,
      gridMomo: 0,
      noahPayout: 0,
    },
    db: {
      ycPayout: 0,
      ycPayIn: 0,
      ycCrossBorder: 0,
      gridPayout: 0,
      gridPayIn: 0,
      gridCrossBorder: 0,
      gridMomo: 0,
    },
    gaps: {
      liveNotInDb: 0,
      dbStaleFlags: 0,
      crossBorderNotMarked: 0,
      gridMomoMissing: 0,
      currencyConflict: 0,
    },
  }

  const currencyConflicts: string[] = []

  for (const k of [...allKeys].sort()) {
    const { country, currency, rail } = parseKey(k)
    const yc = ycLive.get(k)
    const grid = gridLive.get(k)
    const noahPayout = await hasNoahSellChannel({ country, fiatCurrency: currency })

    const live: LiveCaps = {
      noahPayout,
      noahPayIn: false,
      ycPayout: yc?.payout ?? false,
      ycPayIn: yc?.payIn ?? false,
      gridPayout: grid?.payout ?? false,
      gridPayIn: grid?.payIn ?? false,
    }

    if (live.ycPayout) summary.live.ycPayout++
    if (live.ycPayIn) summary.live.ycPayIn++
    if (live.gridPayout) summary.live.gridPayout++
    if (live.gridPayIn) summary.live.gridPayIn++
    if (live.noahPayout) summary.live.noahPayout++
    if (live.ycPayout && live.ycPayIn) summary.live.ycCrossBorder++
    if (live.gridPayout && live.gridPayIn) summary.live.gridCrossBorder++
    if (live.gridPayout && rail === "mobile_money") summary.live.gridMomo++

    const dbRow = (dbRows ?? []).find(
      (r) =>
        String(r.country_code).toUpperCase() === country &&
        String(r.currency_code).toUpperCase() === currency &&
        r.rail === rail,
    )
    const sameCountryRail = (dbRows ?? []).find(
      (r) =>
        String(r.country_code).toUpperCase() === country &&
        r.rail === rail &&
        String(r.currency_code).toUpperCase() !== currency,
    )
    const meta = (dbRow?.metadata ?? {}) as Record<string, unknown>

    if (dbRow) {
      if (metaFlag(meta, "yc_send")) summary.db.ycPayout++
      if (metaFlag(meta, "yc_receive")) summary.db.ycPayIn++
      if (metaFlag(meta, "grid_send")) summary.db.gridPayout++
      if (metaFlag(meta, "grid_receive")) summary.db.gridPayIn++
      if (metaFlag(meta, "yc_send") && metaFlag(meta, "yc_receive")) summary.db.ycCrossBorder++
      if (metaFlag(meta, "grid_send") && metaFlag(meta, "grid_receive")) summary.db.gridCrossBorder++
      if (metaFlag(meta, "grid_send") && rail === "mobile_money") summary.db.gridMomo++
    }

    const hasAnyLive = live.noahPayout || live.ycPayout || live.ycPayIn || live.gridPayout || live.gridPayIn
    if (hasAnyLive && !dbRow) {
      if (
        sameCountryRail &&
        localPaymentCurrencyForCountry(country) === String(sameCountryRail.currency_code).toUpperCase()
      ) {
        // Local payment currency row already covers this country+rail.
        continue
      }
      if (sameCountryRail) {
        currencyConflicts.push(`${k} blocked by existing ${sameCountryRail.country_code}:${sameCountryRail.currency_code}:${rail}`)
        summary.gaps.currencyConflict++
      } else {
        missingInDb.push({ key: k, live })
        summary.gaps.liveNotInDb++
      }
    }

    if (dbRow) {
      const stale: string[] = []
      if (live.ycPayout && !metaFlag(meta, "yc_send")) stale.push("yc_send")
      if (live.ycPayIn && !metaFlag(meta, "yc_receive")) stale.push("yc_receive")
      if (live.gridPayout && !metaFlag(meta, "grid_send")) stale.push("grid_send")
      if (live.gridPayIn && !metaFlag(meta, "grid_receive")) stale.push("grid_receive")
      if (stale.length) {
        dbMissingLive.push({ key: k, dbMeta: meta })
        summary.gaps.dbStaleFlags++
      }

      const liveCross = crossBorderProviders(live)
      const dbCross = dbCrossBorderProviders(meta)
      for (const p of liveCross) {
        if (!dbCross.includes(p)) {
          crossBorderGaps.push(`${k} live_${p}_cross_border db_missing_both_flags`)
          summary.gaps.crossBorderNotMarked++
        }
      }
    }

    if (live.gridPayout && rail === "mobile_money" && !dbRow) {
      momoGaps.push(`${k} grid_momo_live_not_in_db`)
      summary.gaps.gridMomoMissing++
    } else if (live.gridPayout && rail === "mobile_money" && dbRow && !metaFlag(meta, "grid_send")) {
      momoGaps.push(`${k} grid_momo_missing_grid_send_flag`)
      summary.gaps.gridMomoMissing++
    }
  }

  console.log("=== LIVE PROVIDER COVERAGE ===")
  console.log(JSON.stringify(summary.live, null, 2))
  console.log("\n=== DB METADATA FLAGS ===")
  console.log(JSON.stringify(summary.db, null, 2))
  console.log("\n=== GAPS ===")
  console.log(JSON.stringify(summary.gaps, null, 2))

  if (missingInDb.length) {
    console.log(`\n=== LIVE CAPABILITY BUT NO DB ROW (${missingInDb.length}) ===`)
    for (const { key: k, live } of missingInDb.slice(0, 40)) {
      const parts: string[] = []
      if (live.noahPayout) parts.push("noah_payout")
      if (live.ycPayout) parts.push("yc_payout")
      if (live.ycPayIn) parts.push("yc_payin")
      if (live.gridPayout) parts.push("grid_payout")
      if (live.gridPayIn) parts.push("grid_payin")
      console.log(`${k} → ${parts.join(", ")}`)
    }
    if (missingInDb.length > 40) console.log(`... and ${missingInDb.length - 40} more`)
  }

  if (dbMissingLive.length) {
    console.log(`\n=== DB ROW EXISTS BUT MISSING METADATA FLAGS (${dbMissingLive.length}) ===`)
    for (const { key: k } of dbMissingLive.slice(0, 40)) {
      const live = {
        yc: ycLive.get(k),
        grid: gridLive.get(k),
      }
      console.log(`${k} yc=${JSON.stringify(live.yc)} grid=${JSON.stringify(live.grid)}`)
    }
    if (dbMissingLive.length > 40) console.log(`... and ${dbMissingLive.length - 40} more`)
  }

  if (momoGaps.length) {
    console.log(`\n=== GRID MOBILE MONEY GAPS (${momoGaps.length}) ===`)
    momoGaps.forEach((g) => console.log(g))
  }

  if (currencyConflicts.length) {
    console.log(`\n=== MULTI-CURRENCY CONFLICT (${currencyConflicts.length}) ===`)
    console.log("(DB allows one currency per country+rail – alternate live currencies blocked)")
    currencyConflicts.forEach((g) => console.log(g))
  }

  const gridMomoLive = [...gridLive.entries()]
    .filter(([k, v]) => k.endsWith(":mobile_money") && v.payout)
    .map(([k]) => k)
    .sort()
  console.log(`\n=== GRID MOBILE MONEY LIVE (${gridMomoLive.length}) ===`)
  gridMomoLive.forEach((k) => console.log(k))

  const ycCrossLive = [...ycLive.entries()].filter(([, v]) => v.payout && v.payIn).map(([k]) => k).sort()
  const gridCrossLive = [...gridLive.entries()].filter(([, v]) => v.payout && v.payIn).map(([k]) => k).sort()
  console.log(`\n=== YC CROSS-BORDER LIVE (${ycCrossLive.length}) ===`)
  ycCrossLive.forEach((k) => console.log(k))
  console.log(`\n=== GRID CROSS-BORDER LIVE (${gridCrossLive.length}) ===`)
  gridCrossLive.slice(0, 20).forEach((k) => console.log(k))
  if (gridCrossLive.length > 20) console.log(`... and ${gridCrossLive.length - 20} more`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

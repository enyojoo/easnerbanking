/**
 * Grid API corridor coverage vs Office payout_corridors rows (existence, not gating).
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/audit-grid-vs-office.ts
 */
import { createClient } from "@supabase/supabase-js"
import { GRID_STATIC_CORRIDOR_SCHEMAS } from "@easner/shared"
import { listGridDiscoveries, gridDiscoverySupportsCorridor, collectFiatCodesFromDiscoveries } from "../lib/grid/discoveries"
import { collectGridCorridorTargets } from "../lib/fx/grid-corridor-sync"

function pairKey(country: string, currency: string) {
  return `${country.toUpperCase()}:${currency.toUpperCase()}`
}

function rowKey(country: string, currency: string, rail: string) {
  return `${country.toUpperCase()}:${currency.toUpperCase()}:${rail}`
}

async function main() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!supabaseUrl || !serviceRoleKey) throw new Error("supabase_not_configured")

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const discoveries = await listGridDiscoveries(true)
  const targets = collectGridCorridorTargets({ discoveries })

  const { data: officeRows } = await admin
    .from("payout_corridors")
    .select("country_code,currency_code,rail,enabled,metadata,fields_schema")

  const officeRowKeys = new Set((officeRows ?? []).map((r) => rowKey(r.country_code, r.currency_code, r.rail)))
  const officePairKeys = new Set((officeRows ?? []).map((r) => pairKey(r.country_code, r.currency_code)))

  const missingRows = targets
    .filter((t) => !officeRowKeys.has(rowKey(t.countryCode, t.currencyCode, t.rail)))
    .map((t) => rowKey(t.countryCode, t.currencyCode, t.rail))
    .sort()

  const gridPairKeys = new Set<string>()
  for (const t of targets) gridPairKeys.add(pairKey(t.countryCode, t.currencyCode))
  for (const key of Object.keys(GRID_STATIC_CORRIDOR_SCHEMAS)) {
    const [countryCode, currencyCode] = key.split(":")
    gridPairKeys.add(pairKey(countryCode, currencyCode))
  }

  const missingPairs = [...gridPairKeys].filter((k) => !officePairKeys.has(k)).sort()

  const discoveryOnlyPairs = new Map<string, Set<string>>()
  for (const d of discoveries) {
    const cc = String(d.country ?? "").trim().toUpperCase()
    const cur = String(d.currency ?? "").trim().toUpperCase()
    if (!cc || !cur) continue
    for (const rail of ["bank_transfer", "mobile_money"] as const) {
      if (!gridDiscoverySupportsCorridor({ discoveries, countryCode: cc, currencyCode: cur, rail })) continue
      const pk = pairKey(cc, cur)
      const rails = discoveryOnlyPairs.get(pk) ?? new Set()
      rails.add(rail)
      discoveryOnlyPairs.set(pk, rails)
    }
  }

  const officeGridCapable = (officeRows ?? [])
    .filter((r) => {
      const m = (r.metadata ?? {}) as Record<string, unknown>
      return m.grid_send === true || m.grid_receive === true
    })
    .map((r) => rowKey(r.country_code, r.currency_code, r.rail))
    .sort()

  const gridInOfficeNotInApi = officeGridCapable.filter((k) => {
    const [cc, cur, rail] = k.split(":")
    const staticKey = `${cc}:${cur}`
    if (GRID_STATIC_CORRIDOR_SCHEMAS[staticKey]) return false
    return !gridDiscoverySupportsCorridor({
      discoveries,
      countryCode: cc,
      currencyCode: cur,
      rail: rail as "bank_transfer" | "mobile_money",
    })
  })

  const staticOnlyPairs = Object.keys(GRID_STATIC_CORRIDOR_SCHEMAS)
    .filter((k) => {
      const [cc, cur] = k.split(":")
      return !discoveryOnlyPairs.has(pairKey(cc, cur))
    })
    .sort()

  console.log("GRID API")
  console.log(`  discoveries: ${discoveries.length}`)
  console.log(`  fiat codes: ${collectFiatCodesFromDiscoveries(discoveries).join(", ")}`)
  console.log(`  sync targets: ${targets.length}`)
  console.log("")

  console.log("MISSING OFFICE ROWS (Grid supports, no payout_corridors row)")
  if (!missingRows.length) console.log("  (none)")
  else missingRows.forEach((r) => console.log(`  ${r}`))
  console.log("")

  console.log("MISSING OFFICE PAIRS (no row for any rail)")
  if (!missingPairs.length) console.log("  (none)")
  else missingPairs.forEach((r) => console.log(`  ${r}`))
  console.log("")

  console.log("STATIC-ONLY GRID PAIRS (no discovery rows)")
  staticOnlyPairs.forEach((r) => console.log(`  ${r}`))
  console.log("")

  console.log("OFFICE GRID-CAPABLE BUT NOT IN GRID DISCOVERIES (static-backed or stale)")
  if (!gridInOfficeNotInApi.length) console.log("  (none)")
  else gridInOfficeNotInApi.forEach((r) => console.log(`  ${r}`))
  console.log("")

  console.log("ALL GRID SYNC TARGETS")
  for (const t of targets) {
    const inOffice = officeRowKeys.has(rowKey(t.countryCode, t.currencyCode, t.rail))
    console.log(`  ${rowKey(t.countryCode, t.currencyCode, t.rail)}${inOffice ? "" : "  ← MISSING"}`)
  }
  console.log("")

  console.log("STATIC GRID CORRIDORS (API types, often zero discoveries)")
  for (const key of Object.keys(GRID_STATIC_CORRIDOR_SCHEMAS).sort()) {
    const [cc, cur] = key.split(":")
    const schema = GRID_STATIC_CORRIDOR_SCHEMAS[key]
    const rail = schema.channel_type === "momo" ? "mobile_money" : "bank_transfer"
    const rk = rowKey(cc, cur, rail)
    const row = (officeRows ?? []).find(
      (r) => rowKey(r.country_code, r.currency_code, r.rail) === rk,
    )
    const m = (row?.metadata ?? {}) as Record<string, unknown>
    const cap = m.grid_send === true || m.grid_receive === true ? "grid-capable" : "no-grid-flag"
    console.log(
      `  ${rk}  ${row ? `row=yes enabled=${row.enabled} ${cap}` : "ROW MISSING"}`,
    )
  }
  console.log("")

  const missingCapability: string[] = []
  for (const t of targets) {
    const rk = rowKey(t.countryCode, t.currencyCode, t.rail)
    const row = (officeRows ?? []).find(
      (r) => rowKey(r.country_code, r.currency_code, r.rail) === rk,
    )
    if (!row) continue
    const m = (row.metadata ?? {}) as Record<string, unknown>
    if (m.grid_send !== true && m.grid_receive !== true) {
      missingCapability.push(rk)
    }
  }
  console.log("GRID TARGETS IN OFFICE BUT WITHOUT grid_send/grid_receive FLAGS")
  if (!missingCapability.length) console.log("  (none)")
  else missingCapability.sort().forEach((r) => console.log(`  ${r}`))

}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

/**
 * Office fiat bank / mobile money destination enums vs live Grid discoveries.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/audit-grid-destination-mappings.ts
 */
import { createClient } from "@supabase/supabase-js"
import {
  gridBankLabelsMatch,
  unwrapGridFieldsSchema,
} from "@easner/shared"
import {
  gridDiscoverySupportsCorridor,
  isMomoGridDiscovery,
  listGridDiscoveries,
} from "../lib/grid/discoveries"

function rowKey(country: string, currency: string, rail: string) {
  return `${String(country).toUpperCase()}:${String(currency).toUpperCase()}:${rail}`
}

function discoveryNames(
  discoveries: Awaited<ReturnType<typeof listGridDiscoveries>>,
  country: string,
  currency: string,
  rail: "bank_transfer" | "mobile_money",
): string[] {
  const cc = country.toUpperCase()
  const cur = currency.toUpperCase()
  const names = new Set<string>()
  for (const d of discoveries) {
    const dCountry = String(d.country ?? "").trim().toUpperCase()
    const dCurrency = String(d.currency ?? "").trim().toUpperCase()
    if (dCountry !== cc || dCurrency !== cur) continue
    const name = String(d.bankName ?? d.displayName ?? "").trim()
    if (!name) continue
    const momo = isMomoGridDiscovery(d)
    if (rail === "mobile_money") {
      if (momo) names.add(name)
    } else if (!momo) {
      names.add(name)
    }
  }
  return [...names].sort()
}

function officeDestinations(fieldsSchema: unknown, rail: string): string[] {
  const grid = unwrapGridFieldsSchema(fieldsSchema)
  if (rail === "mobile_money") {
    return (grid?.momo_provider_enum ?? [])
      .map((e) => String(e.value || e.label || "").trim())
      .filter(Boolean)
  }
  return (grid?.bank_enum ?? []).map((n) => String(n).trim()).filter(Boolean)
}

function matched(liveName: string, officeNames: string[]): boolean {
  return officeNames.some(
    (office) => office === liveName || gridBankLabelsMatch(office, liveName),
  )
}

function routingPrimary(routing: unknown): string | null {
  if (!Array.isArray(routing)) return null
  const sorted = [...routing]
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      provider: String((item as { provider?: string }).provider ?? "").toLowerCase(),
      priority: Number((item as { priority?: number }).priority ?? 99),
    }))
    .filter((item) => item.provider === "noah" || item.provider === "yellowcard" || item.provider === "grid")
    .sort((a, b) => a.priority - b.priority)
  return sorted[0]?.provider ?? null
}

async function main() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!url || !key) throw new Error("supabase_not_configured")

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const [{ data: rows, error }, discoveries] = await Promise.all([
    admin
      .from("payout_corridors")
      .select("country_code,country_name,currency_code,rail,enabled,metadata,fields_schema,provider_routing")
      .in("rail", ["bank_transfer", "mobile_money"]),
    listGridDiscoveries(true),
  ])
  if (error) throw error

  type Finding = {
    key: string
    rail: string
    country: string
    enabled: boolean
    gridSend: boolean
    gridSendEnabled: boolean
    routedToGrid: boolean
    liveDestinations: number
    officeDestinations: number
    gridSchemaStatus: string
    missingInOffice: string[]
    extraInOffice: string[]
  }

  const findings: Finding[] = []
  const officeKeys = new Set<string>()

  for (const row of rows ?? []) {
    const country = String(row.country_code ?? "").toUpperCase()
    const currency = String(row.currency_code ?? "").toUpperCase()
    const rail = row.rail === "mobile_money" ? "mobile_money" : "bank_transfer"
    const key = rowKey(country, currency, rail)
    officeKeys.add(key)
    const meta = (row.metadata ?? {}) as Record<string, unknown>
    const grid = unwrapGridFieldsSchema(row.fields_schema)
    const live = discoveryNames(discoveries, country, currency, rail)
    const office = officeDestinations(row.fields_schema, rail)
    const liveSupported = gridDiscoverySupportsCorridor({
      discoveries,
      countryCode: country,
      currencyCode: currency,
      rail,
    })
    const routedToGrid = routingPrimary(row.provider_routing) === "grid"
    const gridSend = meta.grid_send === true || meta.grid_send_available === true
    const gridSendEnabled = meta.grid_send_enabled === true
    if (!liveSupported && !gridSend && !gridSendEnabled && !routedToGrid && !grid) continue

    const missingInOffice = live.filter((name) => !matched(name, office))
    const extraInOffice = office.filter((name) => !matched(name, live))
    findings.push({
      key,
      rail,
      country: String(row.country_name || country),
      enabled: row.enabled === true,
      gridSend,
      gridSendEnabled,
      routedToGrid,
      liveDestinations: live.length,
      officeDestinations: office.length,
      gridSchemaStatus: String(grid?.status ?? "missing"),
      missingInOffice,
      extraInOffice,
    })
  }

  const liveMissingOfficeRows: string[] = []
  const seenLive = new Set<string>()
  for (const d of discoveries) {
    const country = String(d.country ?? "").trim().toUpperCase()
    const currency = String(d.currency ?? "").trim().toUpperCase()
    if (!country || !currency) continue
    for (const rail of ["bank_transfer", "mobile_money"] as const) {
      if (!gridDiscoverySupportsCorridor({ discoveries, countryCode: country, currencyCode: currency, rail })) {
        continue
      }
      const key = rowKey(country, currency, rail)
      if (seenLive.has(key)) continue
      seenLive.add(key)
      if (!officeKeys.has(key)) liveMissingOfficeRows.push(key)
    }
  }

  const gridRouted = findings.filter((f) => f.routedToGrid || f.gridSendEnabled)
  const emptyOfficeEnums = gridRouted.filter((f) => f.liveDestinations > 0 && f.officeDestinations === 0)
  const missingNames = gridRouted.filter((f) => f.missingInOffice.length > 0)
  const ready = gridRouted.filter(
    (f) => f.officeDestinations > 0 && f.missingInOffice.length === 0 && f.gridSchemaStatus === "ready",
  )

  const summary = {
    liveDiscoveries: discoveries.length,
    officeFiatRows: rows?.length ?? 0,
    liveCorridors: seenLive.size,
    liveCorridorsMissingOfficeRow: liveMissingOfficeRows.length,
    officeGridRoutedOrEnabled: gridRouted.length,
    gridRoutedBank: gridRouted.filter((f) => f.rail === "bank_transfer").length,
    gridRoutedMomo: gridRouted.filter((f) => f.rail === "mobile_money").length,
    destinationEnumComplete: ready.length,
    emptyDestinationEnum: emptyOfficeEnums.length,
    liveNamesMissingFromOfficeEnum: missingNames.length,
  }

  console.log(JSON.stringify({
    summary,
    liveCorridorsMissingOfficeRow: liveMissingOfficeRows.sort(),
    emptyDestinationEnum: emptyOfficeEnums.map((f) => ({
      key: f.key,
      liveDestinations: f.liveDestinations,
      gridSchemaStatus: f.gridSchemaStatus,
      enabled: f.enabled,
      routedToGrid: f.routedToGrid,
      gridSendEnabled: f.gridSendEnabled,
    })),
    missingLiveNames: missingNames.map((f) => ({
      key: f.key,
      officeDestinations: f.officeDestinations,
      liveDestinations: f.liveDestinations,
      missingCount: f.missingInOffice.length,
      missingSample: f.missingInOffice.slice(0, 12),
    })),
    gridRoutedComplete: ready.map((f) => ({
      key: f.key,
      destinations: f.officeDestinations,
    })),
    gridRoutedAll: gridRouted.map((f) => ({
      key: f.key,
      enabled: f.enabled,
      routedToGrid: f.routedToGrid,
      gridSendEnabled: f.gridSendEnabled,
      live: f.liveDestinations,
      office: f.officeDestinations,
      status: f.gridSchemaStatus,
      missing: f.missingInOffice.length,
    })),
  }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

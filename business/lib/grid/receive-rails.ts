import type { SupabaseClient } from "@supabase/supabase-js"
import {
  gridDiscoverySupportsCorridor,
  isMomoGridDiscovery,
  listGridDiscoveries,
} from "@/lib/grid/discoveries"
import { corridorGridReceiveEnabled } from "@/lib/yellowcard/yc-receive-gate"

export type GridReceiveRail = "bank_transfer" | "mobile_money"

export type GridReceiveRailInfo = {
  available: boolean
  minLocalPayIn: number | null
  maxLocalPayIn: number | null
}

export type GridReceiveRailAvailability = {
  bank_transfer: GridReceiveRailInfo
  mobile_money: GridReceiveRailInfo
}

async function corridorGridReceiveEnabledForRail(
  admin: SupabaseClient,
  input: { countryCode: string; currencyCode: string; rail: GridReceiveRail },
): Promise<boolean> {
  const country = input.countryCode.trim().toUpperCase()
  const currency = input.currencyCode.trim().toUpperCase()
  if (!country || !currency) return false

  const { data } = await admin
    .from("payout_corridors")
    .select("metadata,enabled,rail")
    .eq("country_code", country)
    .eq("currency_code", currency)
    .eq("rail", input.rail)
    .eq("enabled", true)
    .limit(10)

  for (const row of data ?? []) {
    if (corridorGridReceiveEnabled(row.metadata)) return true
  }
  return false
}

export async function resolveGridReceiveRailAvailability(
  admin: SupabaseClient,
  input: { countryCode: string; currencyCode: string },
): Promise<GridReceiveRailAvailability> {
  const country = input.countryCode.trim().toUpperCase()
  const currency = input.currencyCode.trim().toUpperCase()
  const out: GridReceiveRailAvailability = {
    bank_transfer: { available: false, minLocalPayIn: null, maxLocalPayIn: null },
    mobile_money: { available: false, minLocalPayIn: null, maxLocalPayIn: null },
  }
  if (!country || !currency) return out

  const discoveries = await listGridDiscoveries()
  const rails: GridReceiveRail[] = ["bank_transfer", "mobile_money"]

  for (const rail of rails) {
    const corridorOk = await corridorGridReceiveEnabledForRail(admin, {
      countryCode: country,
      currencyCode: currency,
      rail,
    })
    if (!corridorOk) continue
    const discoveryOk = gridDiscoverySupportsCorridor({
      discoveries,
      countryCode: country,
      currencyCode: currency,
      rail,
    })
    if (discoveryOk) {
      out[rail] = { available: true, minLocalPayIn: null, maxLocalPayIn: null }
    }
  }

  return out
}

export type GridPayInNetworkOption = { id: string; name: string }

function stableNetworkId(input: { country: string; currency: string; label: string }): string {
  const slug = input.label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
  return `grid_${input.country}_${input.currency}_${slug || "momo"}`
}

/** MoMo networks for Grid pay-in derived from discoveries. */
export async function resolveGridPayInNetworks(input: {
  country: string
  currency: string
}): Promise<GridPayInNetworkOption[]> {
  const country = input.country.trim().toUpperCase()
  const currency = input.currency.trim().toUpperCase()
  if (!country || !currency) return []

  const discoveries = await listGridDiscoveries()
  const seen = new Set<string>()
  const out: GridPayInNetworkOption[] = []

  for (const d of discoveries) {
    if (String(d.country ?? "").trim().toUpperCase() !== country) continue
    if (String(d.currency ?? "").trim().toUpperCase() !== currency) continue
    if (!isMomoGridDiscovery(d)) continue

    const name = String(d.displayName ?? d.bankName ?? "").trim()
    if (!name) continue
    const id = stableNetworkId({ country, currency, label: name })
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, name })
  }

  return out.sort((a, b) => a.name.localeCompare(b.name))
}

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  defaultCrossBorderProvider,
  parseCrossBorderProvider,
  type CrossBorderProviderId,
} from "@easner/shared"
import { corridorHasGridPayout } from "@/lib/payout-providers/grid-provider"
import { loadCorridorRouting } from "@/lib/payout-providers/router"
import { corridorSupportsGridReceive, corridorGridReceiveEnabled } from "@/lib/yellowcard/yc-receive-gate"

function rowSupportsYcPayout(metadata: unknown, providerRouting: unknown): boolean {
  const meta = (metadata ?? {}) as Record<string, unknown>
  if (meta.yc_send_enabled === false) return false
  if (meta.yc_send === true) return true
  const routing = Array.isArray(providerRouting) ? providerRouting : []
  return routing.some(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      String((entry as { provider?: string }).provider ?? "").toLowerCase() === "yellowcard",
  )
}

function rowSupportsGridPayout(metadata: unknown, providerRouting: unknown): boolean {
  const meta = (metadata ?? {}) as Record<string, unknown>
  if (meta.grid_send_enabled === false) return false
  if (meta.grid_send === true) return true
  const routing = Array.isArray(providerRouting) ? providerRouting : []
  return routing.some(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      String((entry as { provider?: string }).provider ?? "").toLowerCase() === "grid",
  )
}

export async function resolveCrossBorderProviderForDestination(
  admin: SupabaseClient,
  input: {
    countryCode: string
    currencyCode: string
    rail?: "bank_transfer" | "mobile_money"
  },
): Promise<CrossBorderProviderId | null> {
  const country = input.countryCode.trim().toUpperCase()
  const currency = input.currencyCode.trim().toUpperCase()
  if (!country || !currency) return null

  let q = admin
    .from("payout_corridors")
    .select("metadata,provider_routing,enabled,rail")
    .eq("country_code", country)
    .eq("currency_code", currency)
    .eq("enabled", true)

  if (input.rail) q = q.eq("rail", input.rail)

  const { data } = await q.limit(20)
  const rows = data ?? []
  if (rows.length === 0) return null

  let supportYellowcard = false
  let supportGrid = false
  let officeChoice: CrossBorderProviderId | null = null

  for (const row of rows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>
    if (meta.cross_border_enabled === false) continue
    supportYellowcard =
      supportYellowcard || rowSupportsYcPayout(row.metadata, row.provider_routing)
    supportGrid = supportGrid || rowSupportsGridPayout(row.metadata, row.provider_routing)
    officeChoice = officeChoice ?? parseCrossBorderProvider(row.metadata)
  }

  const preferred = officeChoice ?? defaultCrossBorderProvider({ supportYellowcard, supportGrid })
  if (!preferred) return null

  const rail = input.rail ?? "bank_transfer"
  const routing = await loadCorridorRouting(admin, {
    countryCode: country,
    currencyCode: currency,
    rail,
  })

  if (preferred === "grid") {
    const ok = await corridorHasGridPayout(admin, {
      countryCode: country,
      currencyCode: currency,
      rail,
      providerRouting: routing,
    })
    return ok ? "grid" : supportYellowcard ? "yellowcard" : null
  }

  return supportYellowcard ? "yellowcard" : supportGrid ? "grid" : null
}

export async function resolveCrossBorderSourcePayInEnabled(
  admin: SupabaseClient,
  input: {
    provider: CrossBorderProviderId
    sourceCountry: string
    sourceCurrency: string
    rail?: "bank_transfer" | "mobile_money"
  },
): Promise<boolean> {
  const country = input.sourceCountry.trim().toUpperCase()
  const currency = input.sourceCurrency.trim().toUpperCase()
  if (!country || !currency) return false

  if (input.provider === "grid") {
    const { isGridLocalPayInEnabledForCorridor } = await import("@/lib/grid/grid-receive-gate")
    return isGridLocalPayInEnabledForCorridor(admin, {
      countryCode: country,
      currencyCode: currency,
      rail: input.rail,
    })
  }

  const { isYcLocalPayInEnabledForCorridor } = await import("@/lib/yellowcard/yc-receive-gate")
  return isYcLocalPayInEnabledForCorridor(admin, {
    countryCode: country,
    currencyCode: currency,
    rail: input.rail,
  })
}

export { corridorSupportsGridReceive, corridorGridReceiveEnabled }

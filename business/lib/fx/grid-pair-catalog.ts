import type { SupabaseClient } from "@supabase/supabase-js"
import { buildYcCrossPairsFromFiats, isYcFiatCurrency } from "@easner/rate-sync"

function routingHasGrid(providerRouting: unknown): boolean {
  if (!Array.isArray(providerRouting)) return false
  return providerRouting.some((item) => {
    if (!item || typeof item !== "object") return false
    return String((item as Record<string, unknown>).provider ?? "")
      .trim()
      .toLowerCase() === "grid"
  })
}

function corridorHasGridCapability(row: {
  metadata?: unknown
  provider_routing?: unknown
}): boolean {
  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {}
  if (meta.grid_send === true || meta.grid_receive === true) {
    return true
  }
  return routingHasGrid(row.provider_routing)
}

/** Distinct fiat codes from enabled payout corridors with Grid send/receive. */
export async function loadGridFiatCurrenciesFromSupabase(
  supabase: SupabaseClient,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("payout_corridors")
    .select("currency_code,metadata,provider_routing")
    .eq("enabled", true)
    .order("sort_order", { ascending: true, nullsFirst: false })

  if (error) throw error

  const fiats = new Set<string>()
  for (const row of data ?? []) {
    if (!corridorHasGridCapability(row as { metadata?: unknown; provider_routing?: unknown })) {
      continue
    }
    const fiat = String((row as { currency_code?: string }).currency_code ?? "")
      .trim()
      .toUpperCase()
    if (!isYcFiatCurrency(fiat)) continue
    fiats.add(fiat)
  }

  return [...fiats].sort()
}

export { buildYcCrossPairsFromFiats as buildGridCrossPairsFromFiats, isYcFiatCurrency as isGridFiatCurrency }

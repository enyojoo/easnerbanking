import type { SupabaseClient } from "@supabase/supabase-js"
import { isYcFiatCurrency } from "./yc-fiat-currencies"

function routingHasYellowcard(providerRouting: unknown): boolean {
  if (!Array.isArray(providerRouting)) return false
  return providerRouting.some((item) => {
    if (!item || typeof item !== "object") return false
    return String((item as Record<string, unknown>).provider ?? "")
      .trim()
      .toLowerCase() === "yellowcard"
  })
}

function corridorHasYcCapability(row: {
  metadata?: unknown
  provider_routing?: unknown
}): boolean {
  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {}
  if (meta.yc_send === true || meta.yc_receive === true) {
    return true
  }
  return routingHasYellowcard(row.provider_routing)
}

/**
 * Distinct fiat currency codes from enabled payout corridors with Yellowcard send/receive.
 * Used as the allowlist for YC rate sync (mirrors Noah corridor-driven pair catalog).
 */
export async function loadYcFiatCurrenciesFromSupabase(
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
    if (!corridorHasYcCapability(row as { metadata?: unknown; provider_routing?: unknown })) {
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

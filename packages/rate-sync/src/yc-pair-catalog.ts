import type { SupabaseClient } from "@supabase/supabase-js"
import { isYcFiatCurrency } from "./yc-fiat-currencies"

function corridorHasYcCapability(row: {
  metadata?: unknown
  capabilities?: unknown
}): boolean {
  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {}
  if (meta.yc_send === true || meta.yc_receive === true || meta.yc_receive_enabled === true) {
    return true
  }

  const caps = row.capabilities
  if (Array.isArray(caps)) {
    return caps.some((c) => String(c).trim().toLowerCase() === "yellowcard")
  }
  if (caps && typeof caps === "object") {
    const obj = caps as Record<string, unknown>
    if (obj.yellowcard === true) return true
    const providers = obj.providers
    if (Array.isArray(providers) && providers.some((p) => String(p).toLowerCase() === "yellowcard")) {
      return true
    }
  }
  return false
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
    .select("currency_code,metadata,capabilities")
    .eq("enabled", true)
    .order("sort_order", { ascending: true, nullsFirst: false })

  if (error) throw error

  const fiats = new Set<string>()
  for (const row of data ?? []) {
    if (!corridorHasYcCapability(row as { metadata?: unknown; capabilities?: unknown })) continue
    const fiat = String((row as { currency_code?: string }).currency_code ?? "")
      .trim()
      .toUpperCase()
    if (!isYcFiatCurrency(fiat)) continue
    fiats.add(fiat)
  }

  return [...fiats].sort()
}

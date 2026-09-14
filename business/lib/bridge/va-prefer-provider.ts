import type { SupabaseClient } from "@supabase/supabase-js"
import {
  isBridgeNewYorkResidence,
  isBridgeOnboardableResidence,
  projectCorridorForSurface,
  resolveOfficePayInProvider,
  type PayoutProviderId,
} from "@easner/shared"
import { loadUserRoutingSurface } from "@/lib/corridor-routing-surface"

/** Mobile USD/EUR pay-in: Bridge except NY and blocked geos. */
export function preferConsumerVirtualAccountProvider(input: {
  countryCode?: string | null
  state?: string | null
}): "bridge" | "noah" {
  if (isBridgeNewYorkResidence(input) || !isBridgeOnboardableResidence(input)) return "noah"
  return "bridge"
}

export async function resolveVirtualAccountPreferProvider(
  admin: SupabaseClient,
  input: {
    userId: string
    businessId: string | null
    currency: "usd" | "eur" | "gbp"
  },
): Promise<"grid" | "noah" | "bridge" | undefined> {
  if (!input.businessId) {
    const { data: userRow } = await admin
      .from("users")
      .select("kyc_address_country,residence_country,kyc_address_state")
      .eq("id", input.userId)
      .maybeSingle()
    const geoPrefer = preferConsumerVirtualAccountProvider({
      countryCode: String(userRow?.kyc_address_country ?? userRow?.residence_country ?? ""),
      state: String(userRow?.kyc_address_state ?? ""),
    })
    if (geoPrefer === "noah") return "noah"
  }
  const surface = await loadUserRoutingSurface(admin, input.userId)
  const currency = input.currency.toUpperCase()
  let q = admin
    .from("payout_corridors")
    .select("country_code,currency_code,provider_routing,metadata,enabled")
    .eq("currency_code", currency)
    .eq("rail", "bank_transfer")
    .eq("enabled", true)
    .limit(24)
  if (currency === "USD") q = q.eq("country_code", "US")
  const { data } = await q
  for (const row of data ?? []) {
    const projected = projectCorridorForSurface(
      { provider_routing: row.provider_routing, metadata: row.metadata, currency_code: currency },
      input.businessId ? "business" : surface,
    )
    const payIn = resolveOfficePayInProvider(projected.metadata, input.businessId ? "business" : surface)
    if (payIn === "grid" || payIn === "noah" || payIn === "bridge") return payIn
  }
  if (!input.businessId) return "bridge"
  if (currency === "USD") return "grid"
  if (currency === "EUR") return "bridge"
  return undefined
}

export function asVaProvider(value: PayoutProviderId | string | null | undefined): "grid" | "noah" | "bridge" | undefined {
  const v = String(value ?? "").trim().toLowerCase()
  if (v === "grid" || v === "noah" || v === "bridge") return v
  return undefined
}

import type { CorridorContext, PayoutProvider } from "./types"
import {
  listGridDiscoveries,
  gridDiscoverySupportsCorridor,
} from "@/lib/grid/discoveries"

export const gridPayoutProvider: PayoutProvider = {
  id: "grid",
  async supports(ctx: CorridorContext): Promise<boolean> {
    // Office routing is the source of truth on quote/confirm. Live /discoveries
    // pagination is 5–15s on a cold serverless instance and must not run here.
    return Boolean(ctx.countryCode?.trim() && ctx.currencyCode?.trim())
  },
}

/** True when Grid is routed and discoveries support this corridor. */
export async function corridorHasGridPayout(
  admin: import("@supabase/supabase-js").SupabaseClient,
  input: {
    countryCode: string
    currencyCode: string
    rail: "bank_transfer" | "mobile_money"
    providerRouting: import("@easner/shared").ProviderRoutingEntry[]
  },
): Promise<boolean> {
  if (!input.providerRouting.some((entry) => entry.provider === "grid")) return false
  const discoveries = await listGridDiscoveries()
  return gridDiscoverySupportsCorridor({
    discoveries,
    countryCode: input.countryCode.trim().toUpperCase(),
    currencyCode: input.currencyCode.trim().toUpperCase(),
    rail: input.rail,
  })
}

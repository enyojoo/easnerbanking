import {
  listGridDiscoveries,
  gridDiscoverySupportsCorridor,
} from "@/lib/grid/discoveries"
import type { CorridorContext, PayoutProvider } from "./types"

export const gridPayoutProvider: PayoutProvider = {
  id: "grid",
  async supports(ctx: CorridorContext): Promise<boolean> {
    const discoveries = await listGridDiscoveries()
    return gridDiscoverySupportsCorridor({
      discoveries,
      countryCode: ctx.countryCode,
      currencyCode: ctx.currencyCode,
      rail: ctx.rail,
    })
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
  return gridPayoutProvider.supports({
    countryCode: input.countryCode.trim().toUpperCase(),
    currencyCode: input.currencyCode.trim().toUpperCase(),
    rail: input.rail,
    providerRouting: input.providerRouting,
  })
}

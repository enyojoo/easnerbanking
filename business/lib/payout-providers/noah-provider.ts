import { hasNoahSellChannelForRail } from "@/lib/noah/channel-availability"
import type { CorridorContext, PayoutProvider } from "./types"

export const noahPayoutProvider: PayoutProvider = {
  id: "noah",
  async supports(ctx: CorridorContext): Promise<boolean> {
    return hasNoahSellChannelForRail({
      country: ctx.countryCode,
      fiatCurrency: ctx.currencyCode,
      rail: ctx.rail,
    })
  },
}

import type { CorridorContext, PayoutProvider } from "./types"

export const bridgePayoutProvider: PayoutProvider = {
  id: "bridge",
  async supports(ctx: CorridorContext): Promise<boolean> {
    return Boolean(ctx.countryCode?.trim() && ctx.currencyCode?.trim())
  },
}

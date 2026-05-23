import type { CorridorContext, PayoutProvider } from "./types"

/** Stub until Yellowcard integration is wired. */
export const yellowcardPayoutProvider: PayoutProvider = {
  id: "yellowcard",
  async supports(_ctx: CorridorContext): Promise<boolean> {
    return false
  },
}

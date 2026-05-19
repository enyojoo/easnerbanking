import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("@/lib/noah/payout-prepare", () => ({
  fetchSellChannelItems: vi.fn(),
}))

vi.mock("@/lib/noah/config", () => ({
  getNoahSettlementCryptoCurrency: () => "USDC",
}))

import { fetchSellChannelItems } from "@/lib/noah/payout-prepare"
import { clearNoahSellChannelCache, hasNoahSellChannel } from "./channel-availability"

describe("hasNoahSellChannel", () => {
  beforeEach(() => {
    clearNoahSellChannelCache()
    vi.mocked(fetchSellChannelItems).mockReset()
  })

  it("returns true when Noah returns channels", async () => {
    vi.mocked(fetchSellChannelItems).mockResolvedValue([{ ID: "ch1" }])
    await expect(hasNoahSellChannel({ country: "US", fiatCurrency: "USD" })).resolves.toBe(true)
  })

  it("returns false when Noah returns empty", async () => {
    vi.mocked(fetchSellChannelItems).mockResolvedValue([])
    await expect(hasNoahSellChannel({ country: "NG", fiatCurrency: "NGN" })).resolves.toBe(false)
  })
})

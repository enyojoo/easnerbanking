import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("@/lib/noah/payout-prepare", () => ({
  fetchSellChannelItems: vi.fn(),
}))

vi.mock("@/lib/noah/config", () => ({
  getNoahSettlementCryptoCurrency: () => "USDC",
}))

import { fetchSellChannelItems } from "@/lib/noah/payout-prepare"
import {
  clearNoahSellChannelCache,
  hasNoahSellChannel,
  hasNoahSellChannelForRail,
} from "./channel-availability"

describe("hasNoahSellChannel", () => {
  beforeEach(() => {
    clearNoahSellChannelCache()
    vi.mocked(fetchSellChannelItems).mockReset()
  })

  it("returns true when Noah returns channels", async () => {
    vi.mocked(fetchSellChannelItems).mockResolvedValue([
      { ID: "ch1", PaymentMethodCategory: "Bank" },
    ])
    await expect(hasNoahSellChannel({ country: "US", fiatCurrency: "USD" })).resolves.toBe(true)
  })

  it("returns false when Noah returns empty", async () => {
    vi.mocked(fetchSellChannelItems).mockResolvedValue([])
    await expect(hasNoahSellChannel({ country: "NG", fiatCurrency: "NGN" })).resolves.toBe(false)
  })
})

describe("hasNoahSellChannelForRail", () => {
  beforeEach(() => {
    clearNoahSellChannelCache()
    vi.mocked(fetchSellChannelItems).mockReset()
  })

  it("returns true for bank_transfer when Bank channel exists", async () => {
    vi.mocked(fetchSellChannelItems).mockResolvedValue([
      { ID: "bank", PaymentMethodCategory: "Bank", PaymentMethodType: "BankLocal" },
    ])
    await expect(
      hasNoahSellChannelForRail({ country: "NG", fiatCurrency: "NGN", rail: "bank_transfer" }),
    ).resolves.toBe(true)
  })

  it("returns false for mobile_money when only Bank channels exist", async () => {
    vi.mocked(fetchSellChannelItems).mockResolvedValue([
      { ID: "bank", PaymentMethodCategory: "Bank", PaymentMethodType: "BankLocal" },
    ])
    await expect(
      hasNoahSellChannelForRail({ country: "NG", fiatCurrency: "NGN", rail: "mobile_money" }),
    ).resolves.toBe(false)
  })

  it("returns true for mobile_money when Identifier channel exists", async () => {
    vi.mocked(fetchSellChannelItems).mockResolvedValue([
      { ID: "momo", PaymentMethodCategory: "Identifier", PaymentMethodType: "IdentifierMobileMoney" },
    ])
    await expect(
      hasNoahSellChannelForRail({ country: "KE", fiatCurrency: "KES", rail: "mobile_money" }),
    ).resolves.toBe(true)
  })
})

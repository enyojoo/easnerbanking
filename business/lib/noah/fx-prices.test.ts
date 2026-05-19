import { describe, expect, it, vi, beforeEach } from "vitest"
import {
  amountsFromNoahPriceItem,
  fiatToNoahPriceTicker,
  noahImpliedProviderRate,
  noahPricesDestTicker,
  parseNoahPriceResponse,
  resolveCountryForNoahPrices,
} from "./fx-prices"

vi.mock("@/lib/noah/http", () => ({
  noahFetch: vi.fn(),
}))

vi.mock("@/lib/noah/config", () => ({
  getNoahUsdCryptoTicker: () => "USDC",
  getNoahEurCryptoTicker: () => "EURC",
}))

import { noahFetch } from "@/lib/noah/http"

describe("fiatToNoahPriceTicker", () => {
  it("maps wallet-linked fiat to stablecoin tickers", () => {
    expect(fiatToNoahPriceTicker("USD")).toBe("USDC")
    expect(fiatToNoahPriceTicker("EUR")).toBe("EURC")
  })

  it("passes through payout fiat ISO codes", () => {
    expect(fiatToNoahPriceTicker("NGN")).toBe("NGN")
    expect(fiatToNoahPriceTicker("KES")).toBe("KES")
  })
})

describe("noahPricesDestTicker", () => {
  it("uses fiat ISO for destinations (EUR not EURC)", () => {
    expect(noahPricesDestTicker("EUR")).toBe("EUR")
    expect(noahPricesDestTicker("NGN")).toBe("NGN")
  })
})

describe("parseNoahPriceResponse", () => {
  it("reads production Items[0] shape", () => {
    const row = parseNoahPriceResponse({
      Items: [{ SourceAmount: "100", DestinationAmount: "135283.2", Rate: "1352.83" }],
    })
    expect(row?.DestinationAmount).toBe("135283.2")
    const { destinationAmount } = amountsFromNoahPriceItem(row!, 100)
    expect(destinationAmount).toBe(135283.2)
  })
})

describe("resolveCountryForNoahPrices", () => {
  it("prefers explicit country then map then default", () => {
    expect(resolveCountryForNoahPrices("NGN", { country: "NG" })).toBe("NG")
    expect(resolveCountryForNoahPrices("NGN", { countryByCurrency: { NGN: "NG" } })).toBe("NG")
    expect(resolveCountryForNoahPrices("NGN")).toBe("NG")
  })
})

describe("noahImpliedProviderRate", () => {
  beforeEach(() => {
    vi.mocked(noahFetch).mockReset()
  })

  it("returns destination per source from Items[0] with Country", async () => {
    vi.mocked(noahFetch).mockResolvedValue({
      Items: [{ SourceAmount: "100", DestinationAmount: "135283.2" }],
    })

    const rate = await noahImpliedProviderRate({
      sourceCurrency: "USD",
      destinationCurrency: "NGN",
      sourceAmount: 100,
      country: "NG",
    })

    expect(rate).toBeCloseTo(1352.832, 2)
    expect(noahFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/prices",
        query: expect.objectContaining({
          SourceCurrency: "USDC",
          DestinationCurrency: "NGN",
          Country: "NG",
          SourceAmount: "100.00000000",
        }),
      }),
    )
  })

  it("uses EUR fiat ticker for EUR destination not EURC", async () => {
    vi.mocked(noahFetch).mockResolvedValue({
      Items: [{ SourceAmount: "100", DestinationAmount: "84.71" }],
    })

    await noahImpliedProviderRate({
      sourceCurrency: "USD",
      destinationCurrency: "EUR",
      sourceAmount: 100,
      country: "DE",
    })

    expect(noahFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          DestinationCurrency: "EUR",
        }),
      }),
    )
  })
})

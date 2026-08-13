import { describe, expect, it, vi, beforeEach } from "vitest"

const mockGridFetch = vi.fn()
const mockGridFetchAllPages = vi.fn()

vi.mock("./http", () => ({
  gridFetch: (...args: unknown[]) => mockGridFetch(...args),
  gridFetchAllPages: (...args: unknown[]) => mockGridFetchAllPages(...args),
}))

import {
  collectFiatCodesFromDiscoveries,
  fetchGridUsdToFiatExchangeRates,
  listGridExchangeRates,
  pickGridExchangeRateQuote,
} from "./discoveries"

describe("collectFiatCodesFromDiscoveries", () => {
  it("excludes bridge assets and dedupes fiats", () => {
    expect(
      collectFiatCodesFromDiscoveries([
        { country: "NG", currency: "NGN" },
        { country: "US", currency: "USD" },
        { country: "NG", currency: "NGN" },
        { country: "CN", currency: "CNY" },
        { country: "US", currency: "USDC" },
      ]),
    ).toEqual(["CNY", "NGN"])
  })
})

describe("pickGridExchangeRateQuote", () => {
  it("prefers bank transfer rails", () => {
    const picked = pickGridExchangeRateQuote(
      [
        {
          sourceCurrency: "USD",
          destinationCurrency: "NGN",
          destinationPaymentRail: "MOBILE_MONEY",
          exchangeRate: 1,
        },
        {
          sourceCurrency: "USD",
          destinationCurrency: "NGN",
          destinationPaymentRail: "BANK_TRANSFER",
          exchangeRate: 0.0007,
        },
      ],
      "USD",
      "NGN",
    )
    expect(picked?.destinationPaymentRail).toBe("BANK_TRANSFER")
    expect(picked?.exchangeRate).toBe(0.0007)
  })
})

describe("fetchGridUsdToFiatExchangeRates", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches each fiat independently and skips failures", async () => {
    mockGridFetch.mockImplementation(async (opts: { path?: string }) => {
      if (opts.path?.includes("destinationCurrency=NGN")) {
        return {
          data: [
            {
              sourceCurrency: "USD",
              destinationCurrency: "NGN",
              destinationPaymentRail: "BANK_TRANSFER",
              exchangeRate: 0.0007,
            },
          ],
        }
      }
      if (opts.path?.includes("destinationCurrency=CNY")) {
        throw new Error("sendingAmount is too small")
      }
      return { data: [] }
    })

    const { rates, skipped } = await fetchGridUsdToFiatExchangeRates(["NGN", "CNY"])
    expect(rates).toHaveLength(1)
    expect(rates[0]?.destinationCurrency).toBe("NGN")
    expect(skipped).toEqual(["CNY"])
    expect(mockGridFetch).toHaveBeenCalledTimes(2)
  })
})

describe("listGridExchangeRates", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses per-pair fetch when fiat codes are provided", async () => {
    mockGridFetch.mockResolvedValue({
      data: [
        {
          sourceCurrency: "USD",
          destinationCurrency: "KES",
          exchangeRate: 0.0077,
        },
      ],
    })

    const rates = await listGridExchangeRates({ fiatCodes: ["KES"] })
    expect(rates).toHaveLength(1)
    expect(mockGridFetchAllPages).not.toHaveBeenCalled()
    expect(mockGridFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/exchange-rates?sourceCurrency=USD&destinationCurrency=KES",
      }),
    )
  })

  it("falls back to per-pair when bulk exchange-rates fails", async () => {
    mockGridFetchAllPages
      .mockRejectedValueOnce(new Error("bulk failed"))
      .mockResolvedValueOnce([{ country: "NG", currency: "NGN" }])
    mockGridFetch.mockResolvedValue({
      data: [{ sourceCurrency: "USD", destinationCurrency: "NGN", exchangeRate: 0.0007 }],
    })

    const rates = await listGridExchangeRates()
    expect(rates).toHaveLength(1)
    expect(mockGridFetchAllPages).toHaveBeenCalled()
  })
})

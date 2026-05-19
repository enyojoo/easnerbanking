import { describe, expect, it } from "vitest"
import {
  getNoahSendConversionRate,
  noahSendRatesQueryPath,
  noahWalletRowsToRateMap,
} from "./noah-send-rates"

describe("noahSendRatesQueryPath", () => {
  it("includes destinations for valid ISO code", () => {
    expect(noahSendRatesQueryPath("ngn")).toBe(
      "/api/noah/exchange-rates?destinations=NGN",
    )
  })
})

describe("getNoahSendConversionRate", () => {
  it("uses Noah map then reference fallback", () => {
    const map = noahWalletRowsToRateMap([
      { from_currency: "USD", to_currency: "NGN", rate: 1500 },
    ])
    expect(getNoahSendConversionRate(map, "USD", "NGN")).toBe(1500)
    expect(getNoahSendConversionRate({}, "USD", "EUR")).toBeGreaterThan(0)
  })
})

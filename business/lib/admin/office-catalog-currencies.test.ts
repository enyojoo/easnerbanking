import { describe, expect, it } from "vitest"
import {
  filterOfficeFiatCurrencies,
  filterOfficeRatesCurrencies,
  isFiatCurrencyCode,
  isManualPayInCurrencyCode,
  isOfficeManualRatesCurrencyCode,
} from "./office-catalog-currencies"

describe("office-catalog-currencies", () => {
  it("excludes non-manual crypto from fiat helper", () => {
    expect(isFiatCurrencyCode("KES")).toBe(true)
    expect(isFiatCurrencyCode("USDC")).toBe(false)
    expect(isFiatCurrencyCode("BTC")).toBe(false)
  })

  it("includes USDC/USDT for manual rates scope", () => {
    expect(isManualPayInCurrencyCode("USDC")).toBe(true)
    expect(isOfficeManualRatesCurrencyCode("USDC")).toBe(true)
    expect(isOfficeManualRatesCurrencyCode("BTC")).toBe(false)
  })

  it("rates scope keeps payment-method currencies and can_send fiat", () => {
    const rows = [
      { code: "KES", can_send: false },
      { code: "GHS", can_send: true },
      { code: "USDC", can_send: true },
      { code: "BTC", can_send: true },
    ]
    const pm = new Set(["KES"])
    expect(filterOfficeRatesCurrencies(rows, { paymentMethodCodes: pm }).map((r) => r.code)).toEqual([
      "KES",
      "GHS",
      "USDC",
    ])
  })

  it("fiat filter excludes stablecoins", () => {
    const rows = [{ code: "KES" }, { code: "USDC" }]
    expect(filterOfficeFiatCurrencies(rows).map((r) => r.code)).toEqual(["KES"])
  })
})

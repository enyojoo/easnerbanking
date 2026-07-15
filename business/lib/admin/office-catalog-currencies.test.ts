import { describe, expect, it } from "vitest"
import {
  filterOfficeFiatCurrencies,
  filterOfficeReportingFxCurrencies,
  isFiatCurrencyCode,
} from "./office-catalog-currencies"
import { isReportingFxCurrencyCode } from "@/lib/fx/reporting-fx"

describe("office-catalog-currencies", () => {
  it("excludes crypto from fiat helpers", () => {
    expect(isFiatCurrencyCode("KES")).toBe(true)
    expect(isFiatCurrencyCode("USDC")).toBe(false)
    expect(isFiatCurrencyCode("BTC")).toBe(false)
  })

  it("reporting FX scope is base currencies only", () => {
    expect(isReportingFxCurrencyCode("USD")).toBe(true)
    expect(isReportingFxCurrencyCode("KES")).toBe(false)
    expect(isReportingFxCurrencyCode("NGN")).toBe(true)
  })

  it("reporting filter keeps USD/EUR/GBP/NGN only", () => {
    const rows = [{ code: "USD" }, { code: "KES" }, { code: "GBP" }, { code: "USDC" }]
    expect(filterOfficeReportingFxCurrencies(rows).map((r) => r.code)).toEqual(["USD", "GBP"])
  })

  it("fiat filter keeps all fiat codes", () => {
    const rows = [{ code: "KES" }, { code: "USD" }, { code: "USDC" }]
    expect(filterOfficeFiatCurrencies(rows).map((r) => r.code)).toEqual(["KES", "USD"])
  })
})

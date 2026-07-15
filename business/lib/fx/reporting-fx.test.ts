import { describe, expect, it } from "vitest"
import {
  REPORTING_FX_CURRENCY_CODES,
  isReportingFxCurrencyCode,
  isReportingFxPair,
  reportingFxDirectedPairs,
} from "./reporting-fx"

describe("reporting-fx", () => {
  it("defines the four business base currencies", () => {
    expect(REPORTING_FX_CURRENCY_CODES).toEqual(["USD", "EUR", "GBP", "NGN"])
  })

  it("recognizes reporting currency codes", () => {
    expect(isReportingFxCurrencyCode("USD")).toBe(true)
    expect(isReportingFxCurrencyCode("KES")).toBe(false)
  })

  it("validates directed pairs", () => {
    expect(isReportingFxPair("USD", "EUR")).toBe(true)
    expect(isReportingFxPair("USD", "KES")).toBe(false)
    expect(isReportingFxPair("USD", "USD")).toBe(false)
  })

  it("builds 12 directed crosses", () => {
    const pairs = reportingFxDirectedPairs()
    expect(pairs).toHaveLength(12)
    expect(pairs.some((p) => p.from === "USD" && p.to === "EUR")).toBe(true)
  })
})

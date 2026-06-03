import { describe, expect, it } from "vitest"
import type { PayoutFieldsSchemaHint } from "./payout-corridor"
import {
  getBusinessPayoutMin,
  getPayoutLimitsForDisplay,
  resolveEffectivePayoutMin,
} from "./payout-business-limits"

describe("getBusinessPayoutMin", () => {
  it("returns policy floors for major payout currencies", () => {
    expect(getBusinessPayoutMin("USD")).toBe(10)
    expect(getBusinessPayoutMin("EUR")).toBe(10)
    expect(getBusinessPayoutMin("NGN")).toBe(1000)
  })

  it("uses KES 150 for bank and mobile", () => {
    expect(getBusinessPayoutMin("KES", "bank_transfer")).toBe(150)
    expect(getBusinessPayoutMin("KES", "mobile_money")).toBe(150)
  })

  it("uses separate mobile mins for GHS and RWF", () => {
    expect(getBusinessPayoutMin("GHS", "mobile_money")).toBe(40)
    expect(getBusinessPayoutMin("GHS", "bank_transfer")).toBe(10)
    expect(getBusinessPayoutMin("RWF", "mobile_money")).toBe(6000)
    expect(getBusinessPayoutMin("RWF", "bank_transfer")).toBe(6000)
  })
})

describe("resolveEffectivePayoutMin", () => {
  it("uses the higher of Noah and business minimums", () => {
    expect(
      resolveEffectivePayoutMin({
        hints: { limits: { min: "2.5" } } as PayoutFieldsSchemaHint,
        currencyCode: "USD",
      }),
    ).toBe(10)
    expect(
      resolveEffectivePayoutMin({
        hints: { limits: { min: "50" } } as PayoutFieldsSchemaHint,
        currencyCode: "NGN",
      }),
    ).toBe(1000)
  })

  it("applies business min when Noah min is zero", () => {
    expect(
      resolveEffectivePayoutMin({
        hints: { limits: { min: "0", max: "1000000" } } as PayoutFieldsSchemaHint,
        currencyCode: "EUR",
      }),
    ).toBe(10)
  })

  /** Noah manifest mins (docs/noah-payout-manifest.json) — Easner must stay >= Noah. */
  it("uses GHS 40 mobile min when above Noah channel floor", () => {
    expect(
      resolveEffectivePayoutMin({
        hints: { limits: { min: "36.49" } } as PayoutFieldsSchemaHint,
        currencyCode: "GHS",
        rail: "mobile_money",
      }),
    ).toBe(40)
  })

  it("uses RWF 6000 min for bank and mobile when above Noah channel floor", () => {
    for (const rail of ["bank_transfer", "mobile_money"] as const) {
      expect(
        resolveEffectivePayoutMin({
          hints: { limits: { min: "5752" } } as PayoutFieldsSchemaHint,
          currencyCode: "RWF",
          rail,
        }),
      ).toBe(6000)
    }
  })

  it("stays at or above Noah channel mins for African corridors", () => {
    expect(
      resolveEffectivePayoutMin({
        hints: { limits: { min: "10" } } as PayoutFieldsSchemaHint,
        currencyCode: "GHS",
        rail: "bank_transfer",
      }),
    ).toBe(10)
    expect(
      resolveEffectivePayoutMin({
        hints: { limits: { min: "10" } } as PayoutFieldsSchemaHint,
        currencyCode: "ZAR",
      }),
    ).toBe(10)
    expect(
      resolveEffectivePayoutMin({
        hints: { limits: { min: "104" } } as PayoutFieldsSchemaHint,
        currencyCode: "KES",
        rail: "bank_transfer",
      }),
    ).toBe(150)
    expect(
      resolveEffectivePayoutMin({
        hints: { limits: { min: "100" } } as PayoutFieldsSchemaHint,
        currencyCode: "KES",
        rail: "mobile_money",
      }),
    ).toBe(150)
    expect(
      resolveEffectivePayoutMin({
        hints: { limits: { min: "50" } } as PayoutFieldsSchemaHint,
        currencyCode: "NGN",
      }),
    ).toBe(1000)
  })
})

describe("getPayoutLimitsForDisplay", () => {
  it("shows effective min in UI labels", () => {
    const d = getPayoutLimitsForDisplay({
      hints: { limits: { min: "0" } } as PayoutFieldsSchemaHint,
      currencyCode: "EUR",
    })
    expect(d.min).toBe("10")
  })
})

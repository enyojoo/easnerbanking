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

  it("uses KES 500 for bank and mobile", () => {
    expect(getBusinessPayoutMin("KES", "bank_transfer")).toBe(500)
    expect(getBusinessPayoutMin("KES", "mobile_money")).toBe(500)
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

import { describe, expect, it } from "vitest"
import { parsePayoutMinAmount } from "./payout-business-limits"
import { resolvePayoutCountryCode } from "./payout-form-schema"
import type { PayoutFieldsSchemaHint } from "./payout-corridor"

describe("resolvePayoutCountryCode", () => {
  it("prefers explicit country on the recipient row", () => {
    expect(
      resolvePayoutCountryCode({ countryCode: "FR", currencyCode: "EUR" }),
    ).toBe("FR")
  })

  it("maps USD to US when country is omitted", () => {
    expect(resolvePayoutCountryCode({ currencyCode: "USD" })).toBe("US")
  })

  it("defaults EUR to DE for SEPA corridor lookup", () => {
    expect(resolvePayoutCountryCode({ currencyCode: "EUR" })).toBe("DE")
  })

  it("maps NGN to NG", () => {
    expect(resolvePayoutCountryCode({ currencyCode: "NGN" })).toBe("NG")
  })
})

describe("parsePayoutMinAmount", () => {
  it("returns null when min is missing or zero", () => {
    expect(parsePayoutMinAmount(null)).toBeNull()
    expect(parsePayoutMinAmount({ limits: { min: "0" } } as PayoutFieldsSchemaHint)).toBeNull()
    expect(parsePayoutMinAmount(undefined)).toBeNull()
  })

  it("parses positive Noah MinLimit strings", () => {
    expect(
      parsePayoutMinAmount({ limits: { min: "2.5" } } as PayoutFieldsSchemaHint),
    ).toBe(2.5)
  })
})

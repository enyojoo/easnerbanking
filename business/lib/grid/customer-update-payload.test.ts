import { describe, expect, it } from "vitest"
import {
  gridBusinessCustomerUpdatePayload,
  gridIndividualCustomerUpdatePayload,
} from "./customer-update-payload"

describe("gridBusinessCustomerUpdatePayload", () => {
  it("includes BUSINESS discriminator for Grid PATCH oneOf", () => {
    expect(gridBusinessCustomerUpdatePayload({ email: "a@b.com" })).toEqual({
      customerType: "BUSINESS",
      email: "a@b.com",
    })
  })
})

describe("gridIndividualCustomerUpdatePayload", () => {
  it("includes INDIVIDUAL discriminator for Grid PATCH oneOf", () => {
    expect(
      gridIndividualCustomerUpdatePayload({ endUserTermsConsent: { termsVersion: "V1" } }),
    ).toEqual({
      customerType: "INDIVIDUAL",
      endUserTermsConsent: { termsVersion: "V1" },
    })
  })
})

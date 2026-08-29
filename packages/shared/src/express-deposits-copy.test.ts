import { describe, expect, it } from "vitest"
import {
  EXPRESS_US_SSN_ID_TYPE,
  buildExpressKycSubmitInfo,
  isUsSsnComplete,
  normalizeUsSsn,
} from "./express-deposits-copy"

describe("US SSN helpers", () => {
  it("normalizes digits and builds submitKycInfo id_number", () => {
    expect(normalizeUsSsn("123-45-6789")).toBe("123456789")
    expect(isUsSsnComplete("123-45-6789")).toBe(true)
    expect(isUsSsnComplete("12345")).toBe(false)
    const payload = buildExpressKycSubmitInfo({
      form: {
        given_name: "Ada",
        surname: "Lovelace",
        dob_day: "10",
        dob_month: "12",
        dob_year: "1815",
        line1: "1 Main",
        city: "Boston",
        state: "MA",
        postal_code: "02108",
        ssn: "123-45-6789",
      },
      country: "US",
      includeUsSsn: true,
    })
    expect(payload.id_number).toEqual({ type: EXPRESS_US_SSN_ID_TYPE, value: "123456789" })
  })

  it("omits SSN unless asked", () => {
    const payload = buildExpressKycSubmitInfo({
      form: { given_name: "Ada", surname: "Lovelace", ssn: "123456789" },
      country: "US",
    })
    expect(payload.id_number).toBeUndefined()
  })
})

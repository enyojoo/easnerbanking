import { describe, expect, it } from "vitest"
import { parseNoahCustomerForBusiness } from "./parse-noah-customer-for-business"

describe("parse-noah-customer-for-business", () => {
  it("maps entity fields and kyb_verified_at", () => {
    const parsed = parseNoahCustomerForBusiness({
      RegisteredName: "ACME LTD",
      RegistrationNumber: "12345678",
      RegistrationCountry: "GB",
      RegisteredAddress: {
        Street: "10 HIGH STREET",
        City: "LONDON",
        State: "ENG",
        PostCode: "SW1A 1AA",
        Country: "GB",
      },
      Verifications: { Status: "Approved" },
      Occurred: "2025-03-01T12:00:00Z",
    })

    expect(parsed.name).toBe("ACME LTD")
    expect(parsed.registration_number).toBe("12345678")
    expect(parsed.country).toMatch(/United Kingdom|GB/i)
    expect(parsed.address_line1).toBe("10 High Street")
    expect(parsed.city).toBe("London")
    expect(parsed.postal_code).toBe("SW1A 1AA")
    expect(parsed.kyb_verified_at).toBe("2025-03-01T12:00:00.000Z")
  })

  it("uses RegisteredAddress country when RegistrationCountry missing", () => {
    const parsed = parseNoahCustomerForBusiness({
      RegisteredName: "Test Co",
      RegisteredAddress: {
        Street: "Main",
        City: "Paris",
        State: "IDF",
        PostCode: "75001",
        Country: "FR",
      },
      Verifications: { Status: "Approved" },
    })
    expect(parsed.country).toMatch(/France|FR/i)
  })
})

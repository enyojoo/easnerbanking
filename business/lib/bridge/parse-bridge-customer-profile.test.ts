import { describe, expect, it } from "vitest"
import {
  bridgeCountryToIso2,
  parseBridgeAssociatedPersonForUsers,
  parseBridgeCustomerForBusiness,
  parseBridgeCustomerForUsers,
} from "./parse-bridge-customer-profile"

describe("parseBridgeCustomerForUsers", () => {
  it("maps an approved individual onto the Noah identity columns", () => {
    const parsed = parseBridgeCustomerForUsers(
      {
        type: "individual",
        first_name: "ada",
        last_name: "lovelace",
        birth_date: "1990-04-02",
        phone: "+15551212",
        residential_address: {
          street_line_1: "10 Downing",
          city: "London",
          subdivision: "London",
          postal_code: "SW1A",
          country: "GBR",
        },
        identifying_information: [
          { type: "ssn", issuing_country: "USA", number: "xxx-xx-xxxx" },
          { type: "passport", issuing_country: "GBR", number: "123456789" },
        ],
      },
      { approved: true, occurredAt: "2026-09-22T00:00:00.000Z" },
    )

    expect(parsed.full_name).toBe("Ada Lovelace")
    expect(parsed.date_of_birth).toBe("1990-04-02")
    expect(parsed.kyc_id_type).toBe("Passport")
    expect(parsed.kyc_id_number).toBe("123456789")
    expect(parsed.kyc_id_issuing_country).toBe("GB")
    expect(parsed.kyc_address_street).toBe("10 Downing")
    expect(parsed.kyc_address_country).toBe("GB")
    expect(parsed.kyc_verified_at).toBe("2026-09-22T00:00:00.000Z")
    expect(bridgeCountryToIso2("USA")).toBe("US")
  })
})

describe("parseBridgeCustomerForBusiness", () => {
  it("maps legal name, tax id, and registered address", () => {
    const parsed = parseBridgeCustomerForBusiness(
      {
        type: "business",
        business_legal_name: "Ada Labs Ltd",
        business_description: "Software",
        primary_website: "https://ada.example",
        registered_address: {
          street_line_1: "1 King",
          city: "Lagos",
          subdivision: "LA",
          postal_code: "100001",
          country: "NGA",
        },
        identifying_information: [{ type: "ein", issuing_country: "USA", number: "12-3456789" }],
        associated_persons: [
          {
            first_name: "Ada",
            last_name: "Lovelace",
            email: "ada@example.com",
            has_control: true,
            birth_date: "1990-04-02",
            residential_address: {
              street_line_1: "1 King",
              city: "Lagos",
              country: "NGA",
            },
            identifying_information: [{ type: "national_id", issuing_country: "NGA", number: "A123" }],
          },
        ],
      },
      { approved: true, occurredAt: "2026-09-22T00:00:00.000Z" },
    )

    expect(parsed.name).toBe("Ada Labs Ltd")
    expect(parsed.tax_id).toBe("12-3456789")
    expect(parsed.address_line1).toBe("1 King")
    expect(parsed.country).toBe("Nigeria")
    expect(parsed.kyb_verified_at).toBe("2026-09-22T00:00:00.000Z")

    const person = parseBridgeAssociatedPersonForUsers(
      {
        associated_persons: [
          {
            first_name: "Ada",
            last_name: "Lovelace",
            email: "ada@example.com",
            has_control: true,
            birth_date: "1990-04-02",
            identifying_information: [{ type: "national_id", issuing_country: "NGA", number: "A123" }],
          },
        ],
      },
      { ownerEmail: "ada@example.com", approved: true, occurredAt: "2026-09-22T00:00:00.000Z" },
    )
    expect(person.full_name).toBe("Ada Lovelace")
    expect(person.kyc_id_type).toBe("NationalID")
    expect(person.kyc_id_number).toBe("A123")
    expect(person.kyc_id_issuing_country).toBe("NG")
  })
})

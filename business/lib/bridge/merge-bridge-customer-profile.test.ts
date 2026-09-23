import { describe, expect, it } from "vitest"
import { mergeBridgeCustomerRecords } from "./merge-bridge-customer-profile"
import {
  parseBridgeAssociatedPersonForUsers,
  parseBridgeCustomerForUsers,
} from "./parse-bridge-customer-profile"

describe("mergeBridgeCustomerRecords", () => {
  it("keeps webhook identity when the customer GET only has state and country", () => {
    const merged = mergeBridgeCustomerRecords(
      {
        id: "cust",
        first_name: "Ada",
        last_name: "Lovelace",
        status: "active",
        type: "individual",
        residential_address: { subdivision: "California", country: "USA" },
      },
      {
        id: "kyc_link",
        kyc_status: "approved",
        birth_date: "1990-04-02",
        residential_address: {
          street_line_1: "10 Downing",
          city: "London",
          subdivision: "London",
          postal_code: "SW1A",
          country: "GBR",
        },
        identifying_information: [{ type: "passport", issuing_country: "GBR", number: "123456789" }],
      },
    )

    expect(merged.id).toBe("cust")
    expect(merged.status).toBe("active")
    expect(merged.kyc_status).toBe("approved")
    expect(merged.birth_date).toBe("1990-04-02")
    expect(merged.residential_address).toMatchObject({
      street_line_1: "10 Downing",
      city: "London",
      subdivision: "California",
      postal_code: "SW1A",
      country: "USA",
    })

    const parsed = parseBridgeCustomerForUsers(merged, { approved: true, occurredAt: "2026-09-23T00:00:00.000Z" })
    expect(parsed.full_name).toBe("Ada Lovelace")
    expect(parsed.date_of_birth).toBe("1990-04-02")
    expect(parsed.kyc_address_street).toBe("10 Downing")
    expect(parsed.kyc_address_city).toBe("London")
    expect(parsed.kyc_address_state).toBe("California")
    expect(parsed.kyc_address_country).toBe("US")
    expect(parsed.kyc_id_number).toBe("123456789")
    expect(parsed.kyc_verified_at).toBe("2026-09-23T00:00:00.000Z")
  })

  it("fills a business owner from the associated-person detail without dropping webhook identity", () => {
    const merged = mergeBridgeCustomerRecords(
      {
        id: "person",
        email: "ada@example.com",
        first_name: "Ada",
        last_name: "Lovelace",
      },
      {
        id: "person",
        email: "ada@example.com",
        birth_date: "1990-04-02",
        has_control: true,
        residential_address: { street_line_1: "1 King", city: "Lagos", country: "NGA" },
        identifying_information: [{ type: "national_id", issuing_country: "NGA", number: "A123" }],
      },
    )

    const person = parseBridgeAssociatedPersonForUsers(
      { associated_persons: [merged] },
      { ownerEmail: "ada@example.com", approved: true, occurredAt: "2026-09-23T00:00:00.000Z" },
    )
    expect(person.full_name).toBe("Ada Lovelace")
    expect(person.date_of_birth).toBe("1990-04-02")
    expect(person.kyc_address_street).toBe("1 King")
    expect(person.kyc_id_number).toBe("A123")
    expect(person.kyc_verified_at).toBe("2026-09-23T00:00:00.000Z")
  })
})

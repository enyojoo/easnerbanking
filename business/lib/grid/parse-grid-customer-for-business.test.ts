import { describe, expect, it } from "vitest"
import { parseGridCustomerForBusiness } from "./parse-grid-customer-for-business"

describe("parseGridCustomerForBusiness", () => {
  it("maps KYB business fields and registered address separately from operational address", () => {
    const parsed = parseGridCustomerForBusiness({
      kybStatus: "PENDING",
      email: "support@easner.com",
      businessInfo: {
        legalName: "Easner Group, Inc",
        country: "US",
        registrationNumber: "10609372",
        taxId: "246398107",
        address: {
          line1: "131 Continental Dr Suite 305",
          city: "Newark",
          state: "DE",
          postalCode: "19713",
        },
      },
    })

    expect(parsed).toMatchObject({
      name: "Easner Group, Inc",
      country: "United States",
      registration_number: "10609372",
      tax_id: "246398107",
      registered_address_line1: "131 Continental Dr Suite 305",
      registered_address_city: "Newark",
      registered_address_state: "DE",
      registered_address_postal_code: "19713",
    })
    expect(parsed).not.toHaveProperty("support_email")
    expect(parsed).not.toHaveProperty("address_line1")
  })
})

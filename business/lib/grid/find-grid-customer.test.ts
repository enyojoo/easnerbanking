import { describe, expect, it } from "vitest"
import { pickGridBusinessCustomerForOrg } from "./find-grid-customer"

describe("pickGridBusinessCustomerForOrg", () => {
  it("picks the furthest-along BUSINESS customer with the same legal name", () => {
    const picked = pickGridBusinessCustomerForOrg(
      [
        {
          id: "Customer:older",
          customerType: "BUSINESS",
          kybStatus: "UNVERIFIED",
          businessInfo: { legalName: "Easner Group, Inc" },
        } as never,
        {
          id: "Customer:submitted",
          customerType: "BUSINESS",
          kybStatus: "PENDING",
          email: "samuel@easner.com",
          businessInfo: { legalName: "Easner Group, Inc" },
        } as never,
      ],
      { email: "samuel@easner.com", legalName: "Easner Group, Inc" },
    )
    expect(picked?.id).toBe("Customer:submitted")
  })

  it("does not attach a different company that shares a support email", () => {
    const picked = pickGridBusinessCustomerForOrg(
      [
        {
          id: "Customer:other",
          customerType: "BUSINESS",
          email: "support@easner.com",
          businessInfo: { legalName: "Other Biz LLC" },
        } as never,
      ],
      { email: "support@easner.com", legalName: "Easner Group, Inc" },
    )
    expect(picked).toBeNull()
  })
})

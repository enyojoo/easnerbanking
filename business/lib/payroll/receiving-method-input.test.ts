import { describe, expect, it } from "vitest"
import { normalizePayrollReceivingMethodInput } from "./receiving-method-input"

describe("normalizePayrollReceivingMethodInput", () => {
  it("keeps a validated bank destination in Payroll shape", () => {
    expect(
      normalizePayrollReceivingMethodInput(
        {
          type: "bank",
          countryCode: "ng",
          currency: "ngn",
          bankName: "Access Bank",
          accountNumber: "0123456789",
        },
        "Amina Bello",
      ),
    ).toMatchObject({
      type: "bank",
      rail: "bank",
      label: "Access Bank",
      details: {
        fullName: "Amina Bello",
        countryCode: "NG",
        currency: "NGN",
        accountNumber: "0123456789",
      },
    })
  })

  it("rejects incomplete destinations before encryption", () => {
    expect(() =>
      normalizePayrollReceivingMethodInput(
        {
          type: "mobile_money",
          countryCode: "KE",
          currency: "KES",
          provider: "",
          phoneNumber: "",
        },
        "Amina Bello",
      ),
    ).toThrow("Complete the mobile-money details.")
  })
})

import { describe, expect, it } from "vitest"
import { assessInvoiceBusinessReadiness } from "@/lib/invoices/invoice-business-readiness"

describe("invoice-business-readiness", () => {
  it("passes when required issuer fields are set", () => {
    const result = assessInvoiceBusinessReadiness({
      name: "Acme Ltd",
      addressLine1: "10 Market St",
      city: "London",
      country: "United Kingdom",
      supportEmail: "billing@acme.com",
    })
    expect(result.ready).toBe(true)
  })

  it("fails when support email is missing", () => {
    const result = assessInvoiceBusinessReadiness({
      name: "Acme Ltd",
      addressLine1: "10 Market St",
      city: "London",
      country: "United Kingdom",
    })
    expect(result.ready).toBe(false)
    expect(result.missing).toContain("support email")
  })
})

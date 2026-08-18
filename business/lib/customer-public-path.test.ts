import { describe, expect, it } from "vitest"
import { resolveCustomerPublicKind } from "./customer-public-path"

describe("resolveCustomerPublicKind", () => {
  it("uses the pay host for payment-link paths", () => {
    expect(resolveCustomerPublicKind("pay.easner.com", ["easner", "testing"])).toBe("pay")
  })

  it("uses the invoice host for invoice paths", () => {
    expect(resolveCustomerPublicKind("invoice.easner.com", ["easner", "einv-47929786ba35"])).toBe(
      "invoice",
    )
  })

  it("infers invoice vs pay from the path when the host is the deployment URL", () => {
    expect(resolveCustomerPublicKind("easner-business.vercel.app", ["easner", "einv-47929786ba35"])).toBe(
      "invoice",
    )
    expect(resolveCustomerPublicKind("easner-business.vercel.app", ["easner", "testing"])).toBe("pay")
  })
})

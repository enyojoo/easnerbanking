import { describe, expect, it } from "vitest"
import { buildPaymentMethodInsertPayload } from "./payment-methods"

describe("buildPaymentMethodInsertPayload", () => {
  it("assigns id and strips null id from client body", () => {
    const row = buildPaymentMethodInsertPayload({
      id: null,
      currency: "kes",
      type: "mobile_money",
      name: "M-Pesa",
      created_at: null,
    })

    expect(row.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(row.currency).toBe("KES")
    expect(row.status).toBe("active")
    expect(row.created_at).toBeTruthy()
    expect(row.updated_at).toBeTruthy()
  })

  it("requires currency, type, and name", () => {
    expect(() => buildPaymentMethodInsertPayload({ currency: "USD" })).toThrow()
  })
})

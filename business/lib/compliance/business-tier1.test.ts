import { describe, expect, it } from "vitest"
import {
  businessHostedKybCustomerId,
  businessTier1RejectionReasons,
  businessTier1Status,
  isBusinessTier1Complete,
} from "./business-tier1"

describe("business-tier1 grid KYB", () => {
  it("uses verification_status for grid provider", () => {
    expect(
      businessTier1Status({
        verification_provider: "grid",
        verification_status: "not_started",
      }),
    ).toBe("not_started")
    expect(
      isBusinessTier1Complete({
        verification_provider: "grid",
        verification_status: "approved",
      }),
    ).toBe(true)
  })

  it("reads verification rejection reasons", () => {
    expect(
      businessTier1RejectionReasons({
        verification_provider: "grid",
        verification_status: "rejected",
        verification_rejection_reasons: [{ rejectType: "Final" }],
      }),
    ).toEqual([{ rejectType: "Final" }])
  })

  it("uses grid customer id for hosted KYB", () => {
    expect(
      businessHostedKybCustomerId({
        verification_provider: "grid",
        grid_customer_id: "Customer:abc",
      }),
    ).toBe("Customer:abc")
    expect(
      businessHostedKybCustomerId({
        verification_provider: "grid",
        grid_customer_id: null,
      }),
    ).toBeNull()
  })
})

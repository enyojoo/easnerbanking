import { describe, expect, it } from "vitest"
import {
  businessHostedKybCustomerId,
  businessTier1RejectionReasons,
  businessTier1Status,
  isBusinessTier1Complete,
} from "./business-tier1"

describe("business-tier1 grid cutover", () => {
  it("uses verification_status only when provider is grid", () => {
    expect(
      businessTier1Status({
        verification_provider: "grid",
        verification_status: "not_started",
        noah_kyb_status: "under_review",
      }),
    ).toBe("not_started")
    expect(
      isBusinessTier1Complete({
        verification_provider: "grid",
        verification_status: "not_started",
        noah_kyb_status: "approved",
      }),
    ).toBe(false)
  })

  it("falls back to Noah status when provider is not grid", () => {
    expect(
      businessTier1Status({
        verification_provider: "noah",
        verification_status: "not_started",
        noah_kyb_status: "under_review",
      }),
    ).toBe("not_started")
    expect(
      businessTier1Status({
        verification_provider: "noah",
        verification_status: null,
        noah_kyb_status: "under_review",
      }),
    ).toBe("under_review")
  })

  it("ignores legacy Noah final rejection after grid cutover", () => {
    expect(
      businessTier1RejectionReasons({
        verification_provider: "grid",
        verification_status: "not_started",
        verification_rejection_reasons: null,
        noah_kyb_rejection_reasons: [{ rejectType: "Final" }],
      }),
    ).toBeNull()
  })

  it("uses grid customer id only on grid provider", () => {
    expect(
      businessHostedKybCustomerId({
        verification_provider: "grid",
        grid_customer_id: null,
        noah_customer_id: "ebiz_abc",
      }),
    ).toBeNull()
    expect(
      businessHostedKybCustomerId({
        verification_provider: "noah",
        grid_customer_id: null,
        noah_customer_id: "ebiz_abc",
      }),
    ).toBe("ebiz_abc")
  })
})

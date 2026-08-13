import { describe, expect, it } from "vitest"
import { canonicalVerificationStatus } from "./verification-store"

describe("canonicalVerificationStatus", () => {
  it("Grid business KYB uses verification_status only", () => {
    expect(
      canonicalVerificationStatus({
        verification_provider: "grid",
        verification_status: "not_started",
      }),
    ).toBe("not_started")
    expect(
      canonicalVerificationStatus({
        verification_provider: "grid",
        verification_status: "approved",
      }),
    ).toBe("approved")
  })

  it("falls back to Noah status for individual users", () => {
    expect(
      canonicalVerificationStatus({
        verification_provider: "noah",
        verification_status: "not_started",
        noah_kyc_status: "under_review",
      }),
    ).toBe("pending")
    expect(
      canonicalVerificationStatus({
        verification_provider: "noah",
        verification_status: null,
        noah_kyc_status: "under_review",
      }),
    ).toBe("pending")
    expect(
      canonicalVerificationStatus({
        verification_provider: "noah",
        verification_status: "approved",
        noah_kyc_status: "under_review",
      }),
    ).toBe("approved")
  })
})

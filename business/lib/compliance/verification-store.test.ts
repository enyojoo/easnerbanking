import { describe, expect, it } from "vitest"
import { canonicalVerificationStatus } from "./verification-store"

describe("canonicalVerificationStatus", () => {
  it("trusts Grid SoR even when Noah mirror is approved", () => {
    expect(
      canonicalVerificationStatus({
        verification_provider: "grid",
        verification_status: "not_started",
        verification_rejection_reasons: null,
        noah_kyb_status: "approved",
      }),
    ).toBe("not_started")
  })

  it("falls back to Noah mirror when SoR is not_started (non-Grid)", () => {
    expect(
      canonicalVerificationStatus({
        verification_provider: "noah",
        verification_status: "not_started",
        verification_rejection_reasons: null,
        noah_kyc_status: "approved",
      }),
    ).toBe("approved")
    expect(
      canonicalVerificationStatus({
        verification_provider: "noah",
        verification_status: "not_started",
        verification_rejection_reasons: null,
        noah_kyc_status: "under_review",
      }),
    ).toBe("pending")
  })

  it("prefers progressed canonical status over Noah mirror", () => {
    expect(
      canonicalVerificationStatus({
        verification_provider: "noah",
        verification_status: "rejected",
        verification_rejection_reasons: null,
        noah_kyc_status: "approved",
      }),
    ).toBe("rejected")
  })
})

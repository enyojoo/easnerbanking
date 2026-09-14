import { describe, expect, it } from "vitest"
import { canonicalVerificationStatus } from "./verification-store"

describe("canonicalVerificationStatus", () => {
  it("Grid business KYB uses verification_status when Bridge is not approved", () => {
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
    expect(
      canonicalVerificationStatus({
        verification_provider: "grid",
        verification_status: "in_progress",
      }),
    ).toBe("in_progress")
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

  it("uses verification_status for Bridge individuals", () => {
    expect(
      canonicalVerificationStatus({
        verification_provider: "bridge",
        verification_status: "approved",
      }),
    ).toBe("approved")
    expect(
      canonicalVerificationStatus({
        verification_provider: "bridge",
        verification_status: "in_progress",
      }),
    ).toBe("in_progress")
  })

  it("unlocks when either Grid or Bridge is approved", () => {
    expect(
      canonicalVerificationStatus({
        verification_provider: "grid",
        verification_status: "in_progress",
        bridge_kyc_status: "approved",
      }),
    ).toBe("approved")
    expect(
      canonicalVerificationStatus({
        verification_provider: null,
        verification_status: "not_started",
        bridge_kyc_status: "approved",
      }),
    ).toBe("approved")
    expect(
      canonicalVerificationStatus({
        verification_provider: "grid",
        verification_status: "approved",
        bridge_kyc_status: "not_started",
      }),
    ).toBe("approved")
  })
})

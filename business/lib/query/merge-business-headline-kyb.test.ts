import { describe, expect, it } from "vitest"
import { mergeBusinessHeadlineKybFromRealtime } from "./merge-business-headline-kyb"

const T1 = "2026-09-01T12:00:00.000Z"
const T2 = "2026-09-10T12:00:00.000Z"

describe("mergeBusinessHeadlineKybFromRealtime", () => {
  it("keeps cached Grid approved when a Bridge-only row omits verification_status", () => {
    const merged = mergeBusinessHeadlineKybFromRealtime(
      {
        bridge_kyc_status: "under_review",
        bridge_kyc_status_updated_at: T2,
      },
      {
        tier1VerificationStatus: "approved",
        bridgeKycStatus: "not_started",
        gridKybStatusUpdatedAt: T1,
      },
    )
    expect(merged.gridStatus).toBe("approved")
    expect(merged.bridgeHubStatus).toBe("pending")
    expect(merged.headlineVerificationStatus).toBe("pending")
  })

  it("does not drop Grid approved to not_started on a payload with empty KYB fields", () => {
    const merged = mergeBusinessHeadlineKybFromRealtime(
      { name: "Acme Ltd" },
      {
        tier1VerificationStatus: "approved",
        bridgeKycStatus: "not_started",
        gridKybStatusUpdatedAt: T1,
      },
    )
    expect(merged.gridStatus).toBe("approved")
    expect(merged.headlineVerificationStatus).toBe("approved")
  })

  it("lets a later Bridge change lead after Grid was approved", () => {
    const merged = mergeBusinessHeadlineKybFromRealtime(
      {
        verification_status: "approved",
        bridge_kyc_status: "in_progress",
        grid_kyb_status_updated_at: T1,
        bridge_kyc_status_updated_at: T2,
      },
      {
        tier1VerificationStatus: "approved",
        bridgeKycStatus: "not_started",
        gridKybStatusUpdatedAt: T1,
      },
    )
    expect(merged.headlineVerificationStatus).toBe("in_progress")
  })

  it("uses cached Grid rejected when Bridge later goes in review", () => {
    const merged = mergeBusinessHeadlineKybFromRealtime(
      {
        bridge_kyc_status: "pending",
        bridge_kyc_status_updated_at: T2,
      },
      {
        tier1VerificationStatus: "rejected",
        bridgeKycStatus: "not_started",
        gridKybStatusUpdatedAt: T1,
      },
    )
    expect(merged.gridStatus).toBe("rejected")
    expect(merged.headlineVerificationStatus).toBe("pending")
  })
})

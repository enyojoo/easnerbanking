import { describe, expect, it } from "vitest"
import {
  canonicalVerificationStatus,
  kybStatusTimestampPatch,
  looksLikeMissingKybTimestampColumn,
} from "./verification-store"

describe("kybStatusTimestampPatch", () => {
  const now = "2026-09-17T10:00:00.000Z"

  it("bumps only when the stored status changes", () => {
    expect(
      kybStatusTimestampPatch({
        previous: "pending",
        next: "pending",
        now,
        column: "grid_kyb_status_updated_at",
      }),
    ).toEqual({})
    expect(
      kybStatusTimestampPatch({
        previous: "PENDING",
        next: "pending",
        now,
        column: "bridge_kyc_status_updated_at",
      }),
    ).toEqual({})
    expect(
      kybStatusTimestampPatch({
        previous: "approved",
        next: "in_progress",
        now,
        column: "bridge_kyc_status_updated_at",
      }),
    ).toEqual({ bridge_kyc_status_updated_at: now })
  })

  it("treats empty as not_started so the first idle write does not stamp", () => {
    expect(
      kybStatusTimestampPatch({
        previous: null,
        next: "not_started",
        now,
        column: "grid_kyb_status_updated_at",
      }),
    ).toEqual({})
    expect(
      kybStatusTimestampPatch({
        previous: null,
        next: "in_progress",
        now,
        column: "grid_kyb_status_updated_at",
      }),
    ).toEqual({ grid_kyb_status_updated_at: now })
  })
})

describe("looksLikeMissingKybTimestampColumn", () => {
  it("matches the PostgREST schema-cache error that blocked Bridge webhooks", () => {
    expect(
      looksLikeMissingKybTimestampColumn({
        code: "PGRST204",
        message:
          "Could not find the 'bridge_kyc_status_updated_at' column of 'businesses' in the schema cache",
      }),
    ).toBe(true)
    expect(
      looksLikeMissingKybTimestampColumn({
        code: "42703",
        message: 'column "grid_kyb_status_updated_at" of relation "businesses" does not exist',
      }),
    ).toBe(true)
    expect(
      looksLikeMissingKybTimestampColumn({
        message: "Could not find the 'updated_at' column of 'businesses' in the schema cache",
      }),
    ).toBe(false)
  })
})

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

import { describe, expect, it } from "vitest"
import {
  isBusinessProfileLockedFromKybFields,
  isProfileLockedFromKycFields,
} from "./verified-identity"

describe("verified-identity lock helpers", () => {
  it("isBusinessProfileLockedFromKybFields when approved with timestamp", () => {
    expect(
      isBusinessProfileLockedFromKybFields({
        noah_kyb_status: "approved",
        kyb_verified_at: "2025-01-01T00:00:00Z",
      }),
    ).toBe(true)
    expect(
      isBusinessProfileLockedFromKybFields({
        noah_kyb_status: "approved",
        kyb_verified_at: null,
      }),
    ).toBe(false)
  })

  it("isProfileLockedFromKycFields for individual approval", () => {
    expect(
      isProfileLockedFromKycFields({
        noah_kyc_status: "approved",
        kyc_verified_at: "2025-01-01T00:00:00Z",
      }),
    ).toBe(true)
  })

  it("isProfileLockedFromKycFields for KYB representative sync", () => {
    expect(
      isProfileLockedFromKycFields(
        {
          noah_kyc_status: "not_started",
          kyc_verified_at: "2025-01-01T00:00:00Z",
          kyc_id_type: "Passport",
        },
        { orgKybApproved: true },
      ),
    ).toBe(true)
    expect(
      isProfileLockedFromKycFields(
        {
          kyc_verified_at: "2025-01-01T00:00:00Z",
          kyc_id_type: "Passport",
        },
        { orgKybApproved: false },
      ),
    ).toBe(false)
  })
})

import { describe, expect, it } from "vitest"
import {
  countryDisplayName,
  isBusinessProfileLockedFromKybFields,
  isProfileLockedFromKycFields,
  buildVerifiedIdentityFromKycFields,
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

  it("ignores legacy Noah approved mirror after Grid cutover reset", () => {
    expect(
      isBusinessProfileLockedFromKybFields({
        verification_provider: "grid",
        verification_status: "not_started",
        noah_kyb_status: "approved",
        kyb_verified_at: "2025-01-01T00:00:00Z",
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

  it("isProfileLockedFromKycFields for Grid verification_status approved", () => {
    expect(
      isProfileLockedFromKycFields({
        verification_provider: "grid",
        verification_status: "approved",
        kyc_verified_at: "2025-01-01T00:00:00Z",
        noah_kyc_status: null,
      }),
    ).toBe(true)
  })

  it("buildVerifiedIdentityFromKycFields hides owner KYC until KYB is approved", () => {
    const pending = buildVerifiedIdentityFromKycFields(
      {
        verification_provider: "grid",
        verification_status: "pending",
        kyc_id_type: "Tax ID",
        kyc_id_number: "22380755976",
        kyc_id_issuing_country: "Nigeria",
        kyc_address_street: "39 Plot, Apo Dutse",
        kyc_address_city: "Abuja",
        kyc_address_country: "Nigeria",
      },
      { orgKybApproved: false },
    )
    expect(pending.visible).toBe(false)

    const approved = buildVerifiedIdentityFromKycFields(
      {
        verification_provider: "grid",
        verification_status: "approved",
        kyc_id_type: "Tax ID",
        kyc_id_number: "22380755976",
        kyc_id_issuing_country: "Nigeria",
        kyc_address_street: "39 Plot, Apo Dutse",
        kyc_address_city: "Abuja",
        kyc_address_country: "Nigeria",
      },
      { orgKybApproved: true },
    )
    expect(approved.visible).toBe(true)
    expect(approved.idType).toBe("Tax ID")
    expect(approved.addressLines?.length).toBeGreaterThan(0)
    expect(approved.addressCountry?.name).toBe("Nigeria")
  })
})

describe("countryDisplayName", () => {
  it("uses short names for Congo countries", () => {
    expect(countryDisplayName("CD")).toBe("DR Congo")
    expect(countryDisplayName("CG")).toBe("Congo")
  })

  it("uses Hong Kong instead of Intl SAR China label", () => {
    expect(countryDisplayName("HK")).toBe("Hong Kong")
  })
})

import { describe, expect, it, vi, beforeEach } from "vitest"
import {
  parseGridBeneficialOwnerForOwnerUsers,
  pickGridBeneficialOwner,
} from "./parse-grid-beneficial-owner-for-users"
import { parseGridEndUserTermsFromGridCustomer } from "./end-user-terms-consent"

describe("pickGridBeneficialOwner", () => {
  it("prefers highest-ownership UBO", () => {
    const owner = pickGridBeneficialOwner({
      beneficialOwners: [
        { roles: ["UBO"], ownershipPercentage: 10, personalInfo: { firstName: "Low" } },
        { roles: ["UBO"], ownershipPercentage: 90, personalInfo: { firstName: "Samuel" } },
      ],
    })
    expect(owner?.personalInfo).toEqual({ firstName: "Samuel" })
  })

  it("prefers beneficial owner matching org owner full name", () => {
    const owner = pickGridBeneficialOwner(
      {
        beneficialOwners: [
          {
            id: "BeneficialOwner:low",
            roles: ["UBO"],
            ownershipPercentage: 90,
            personalInfo: { firstName: "Other", lastName: "Person" },
          },
          {
            id: "BeneficialOwner:sam",
            roles: ["UBO"],
            ownershipPercentage: 10,
            personalInfo: { firstName: "Samuel", lastName: "Odiba" },
          },
        ],
      },
      { ownerFullName: "Samuel Enyojo Odiba" },
    )
    expect(owner?.id).toBe("BeneficialOwner:sam")
  })
})

describe("parseGridEndUserTermsFromGridCustomer", () => {
  it("maps business customer endUserTermsConsent to users columns", () => {
    const parsed = parseGridEndUserTermsFromGridCustomer({
      endUserTermsConsent: {
        acceptedAt: "2026-08-12T21:21:46.258000Z",
        ipAddress: "147.243.247.169",
        termsVersion: "V1",
        acceptanceMethod: "CLICK_TO_ACCEPT",
      },
    })
    expect(parsed.grid_end_user_terms_version).toBe("V1")
    expect(parsed.grid_end_user_terms_accepted_at).toBe("2026-08-12T21:21:46.258000Z")
    expect(parsed.grid_end_user_terms_accept_ip).toBe("147.243.247.169")
    expect(parsed.grid_end_user_terms_accept_method).toBe("grid_click_to_accept")
    expect(parsed.grid_end_user_terms_synced_at).toBeTruthy()
  })
})

describe("parseGridBeneficialOwnerForOwnerUsers", () => {
  it("maps personalInfo into users KYC columns", () => {
    const parsed = parseGridBeneficialOwnerForOwnerUsers({
      beneficialOwners: [
        {
          id: "BeneficialOwner:019ff8c8",
          roles: ["UBO"],
          ownershipPercentage: 90,
          kycStatus: "PENDING",
          personalInfo: {
            firstName: "Samuel",
            middleName: "Enyojo",
            lastName: "Odiba",
            birthDate: "1996-11-06",
            nationality: "NG",
            idType: "NON_US_TAX_ID",
            identifier: "22380755976",
            countryOfIssuance: "NG",
            address: {
              line1: "39 Plot, Apo Dutse",
              city: "Abuja",
              state: "FCT",
              postalCode: "900108",
              country: "NG",
            },
          },
        },
      ],
    })

    expect(parsed.full_name).toBe("Samuel Enyojo Odiba")
    expect(parsed.date_of_birth).toBe("1996-11-06")
    expect(parsed.residence_country).toBe("NG")
    expect(parsed.kyc_id_type).toBe("Tax ID")
    expect(parsed.kyc_id_number).toBe("22380755976")
    expect(parsed.kyc_address_city).toBe("Abuja")
    expect(parsed.kyc_address_country).toBeTruthy()
  })
})

import { describe, expect, it, vi, beforeEach } from "vitest"

const mockPersistVerificationStatus = vi.fn().mockResolvedValue(undefined)
const mockResolveOrgOwnerUserId = vi.fn().mockResolvedValue("owner-1")

vi.mock("@/lib/business/org-owner", () => ({
  resolveOrgOwnerUserId: (...args: unknown[]) => mockResolveOrgOwnerUserId(...args),
}))

vi.mock("@/lib/compliance", () => ({
  mapGridPartnerStatus: (raw: string) => {
    const s = String(raw ?? "").toUpperCase()
    if (s === "APPROVED") return "approved"
    if (s === "PENDING") return "pending"
    return "not_started"
  },
  persistVerificationStatus: (...args: unknown[]) => mockPersistVerificationStatus(...args),
}))

const mockOwnerUpdate = vi.fn()
const mockOwnerEq = vi.fn().mockResolvedValue({ error: null })
mockOwnerUpdate.mockReturnValue({ eq: mockOwnerEq })

const mockFrom = vi.fn(() => ({
  select: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "owner-1",
          email: "hello@easner.com",
          full_name: "Samuel Enyojo Odiba",
          verification_status: "not_started",
          noah_kyc_status: null,
        },
      }),
    }),
  }),
  update: mockOwnerUpdate,
}))

const mockAdmin = { from: mockFrom }

import { syncGridBusinessOwnerUserFromKyb } from "./sync-grid-business-owner-user"

const EASNER_CUSTOMER = {
  endUserTermsConsent: {
    acceptedAt: "2026-08-12T21:21:46.258000Z",
    ipAddress: "147.243.247.169",
    termsVersion: "V1",
    acceptanceMethod: "CLICK_TO_ACCEPT",
  },
  beneficialOwners: [
    {
      id: "BeneficialOwner:019ff8c8-66cb-8887-0000-9dbe15c60c97",
      roles: ["UBO"],
      ownershipPercentage: 90,
      kycStatus: "PENDING",
      personalInfo: {
        firstName: "Samuel",
        middleName: "Enyojo",
        lastName: "Odiba",
        birthDate: "1996-11-06",
        nationality: "NG",
      },
    },
  ],
}

describe("syncGridBusinessOwnerUserFromKyb", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOwnerUpdate.mockReturnValue({ eq: mockOwnerEq })
  })

  it("syncs owner profile, terms, and verification from beneficial owner", async () => {
    const result = await syncGridBusinessOwnerUserFromKyb({
      admin: mockAdmin as never,
      businessId: "biz-1",
      fallbackUserId: "fallback",
      customer: EASNER_CUSTOMER,
    })

    expect(mockResolveOrgOwnerUserId).toHaveBeenCalledWith(mockAdmin, "biz-1", "fallback")
    expect(result.ownerUserId).toBe("owner-1")
    expect(result.beneficialOwnerId).toBe("BeneficialOwner:019ff8c8-66cb-8887-0000-9dbe15c60c97")
    expect(result.ownerVerificationStatus).toBe("pending")

    expect(mockOwnerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        full_name: "Samuel Enyojo Odiba",
        residence_country: "NG",
        grid_beneficial_owner_id: "BeneficialOwner:019ff8c8-66cb-8887-0000-9dbe15c60c97",
        grid_end_user_terms_version: "V1",
        grid_end_user_terms_accept_method: "grid_click_to_accept",
      }),
    )
    expect(mockPersistVerificationStatus).toHaveBeenCalledWith(
      mockAdmin,
      expect.objectContaining({
        kind: "individual",
        userId: "owner-1",
        provider: "grid",
        status: "pending",
      }),
    )
  })

  it("syncs owner profile from UBO when KYB is approved even if owner already approved", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "owner-1",
              email: "hello@easner.com",
              full_name: "Samuel Enyojo Odiba",
              verification_status: "approved",
              noah_kyc_status: null,
            },
          }),
        }),
      }),
      update: mockOwnerUpdate,
    })

    await syncGridBusinessOwnerUserFromKyb({
      admin: mockAdmin as never,
      businessId: "biz-1",
      fallbackUserId: "fallback",
      customer: {
        ...EASNER_CUSTOMER,
        beneficialOwners: [
          {
            id: "BeneficialOwner:019ff8c8-66cb-8887-0000-9dbe15c60c97",
            roles: ["UBO"],
            ownershipPercentage: 90,
            kycStatus: "APPROVED",
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
                state: "FC",
                postalCode: "900108",
                country: "NG",
              },
            },
          },
        ],
      },
      kybApproved: true,
    })

    expect(mockOwnerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        kyc_id_type: "Tax ID",
        kyc_id_number: "22380755976",
        kyc_address_street: "39 Plot, Apo Dutse",
      }),
    )
  })
})

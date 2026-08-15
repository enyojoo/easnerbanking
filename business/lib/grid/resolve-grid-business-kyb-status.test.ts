import { describe, expect, it } from "vitest"
import { resolveGridBusinessKybLocalStatus } from "./resolve-grid-business-kyb-status"

describe("resolveGridBusinessKybLocalStatus", () => {
  it("maps terminal Grid statuses", () => {
    expect(resolveGridBusinessKybLocalStatus({ customer: { kybStatus: "APPROVED" } })).toBe(
      "approved",
    )
    expect(resolveGridBusinessKybLocalStatus({ customer: { kybStatus: "REJECTED" } })).toBe(
      "rejected",
    )
    expect(resolveGridBusinessKybLocalStatus({ customer: { kybStatus: "HOLD" } })).toBe("hold")
    expect(resolveGridBusinessKybLocalStatus({ customer: { kybStatus: "UNVERIFIED" } })).toBe(
      "not_started",
    )
  })

  it("treats PENDING with pending UBO and no verifications as in_progress", () => {
    expect(
      resolveGridBusinessKybLocalStatus({
        customer: {
          kybStatus: "PENDING",
          beneficialOwners: [{ kycStatus: "PENDING", roles: ["UBO"] }],
        },
        verifications: [],
      }),
    ).toBe("in_progress")
  })

  it("treats PENDING with PENDING_MANUAL_REVIEW verification as pending (in review)", () => {
    expect(
      resolveGridBusinessKybLocalStatus({
        customer: {
          kybStatus: "PENDING",
          beneficialOwners: [{ kycStatus: "PENDING", roles: ["UBO"] }],
        },
        verifications: [{ verificationStatus: "PENDING_MANUAL_REVIEW" }],
      }),
    ).toBe("pending")
  })

  it("treats PENDING with all UBOs approved as pending (in review)", () => {
    expect(
      resolveGridBusinessKybLocalStatus({
        customer: {
          kybStatus: "PENDING",
          beneficialOwners: [{ kycStatus: "APPROVED", roles: ["UBO"] }],
        },
        verifications: [],
      }),
    ).toBe("pending")
  })

  it("treats PENDING with RESOLVE_ERRORS verifications as in_progress when profile is incomplete", () => {
    expect(
      resolveGridBusinessKybLocalStatus({
        customer: { kybStatus: "PENDING" },
        verifications: [{ verificationStatus: "RESOLVE_ERRORS" }],
      }),
    ).toBe("in_progress")
  })

  it("treats PENDING with BYO RESOLVE_ERRORS and complete hosted profile as pending (in review)", () => {
    expect(
      resolveGridBusinessKybLocalStatus({
        customer: {
          kybStatus: "PENDING",
          businessInfo: {
            legalName: "Easner Group, Inc",
            taxId: "246398107",
            country: "US",
          },
          beneficialOwners: [
            {
              kycStatus: "PENDING",
              roles: ["UBO"],
              personalInfo: {
                firstName: "Samuel",
                lastName: "Odiba",
                birthDate: "1996-11-06",
                identifier: "22380755976",
                email: "hello@easner.com",
                address: { country: "NG" },
              },
            },
          ],
        },
        verifications: [
          {
            verificationStatus: "RESOLVE_ERRORS",
            errors: [{ type: "MISSING_FIELD" }, { type: "MISSING_IDENTITY_DOCUMENT" }],
          },
        ],
      }),
    ).toBe("pending")
  })

  it("treats PENDING with complete hosted profile and no verifications as pending (in review)", () => {
    expect(
      resolveGridBusinessKybLocalStatus({
        customer: {
          kybStatus: "PENDING",
          businessInfo: {
            legalName: "Easner Group, Inc",
            taxId: "246398107",
            country: "US",
          },
          beneficialOwners: [
            {
              kycStatus: "PENDING",
              roles: ["UBO"],
              personalInfo: {
                firstName: "Samuel",
                lastName: "Odiba",
                birthDate: "1996-11-06",
                identifier: "22380755976",
                email: "hello@easner.com",
                address: { country: "NG" },
              },
            },
          ],
        },
        verifications: [],
      }),
    ).toBe("pending")
  })
})

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

  it("treats a REJECTED verification as terminal even when the customer is still PENDING", () => {
    expect(
      resolveGridBusinessKybLocalStatus({
        customer: { kybStatus: "PENDING" },
        verifications: [{ verificationStatus: "REJECTED" }],
      }),
    ).toBe("rejected")
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

  it("keeps in_progress when verification is IN_PROGRESS but ID is still missing", () => {
    expect(
      resolveGridBusinessKybLocalStatus({
        customer: {
          kybStatus: "PENDING",
          beneficialOwners: [{ kycStatus: "PENDING", roles: ["UBO"] }],
        },
        verifications: [
          {
            verificationStatus: "IN_PROGRESS",
            errors: [{ type: "MISSING_IDENTITY_DOCUMENT" }],
          },
        ],
        documents: [],
      }),
    ).toBe("in_progress")
  })

  it("does not treat IN_PROGRESS alone as ID uploaded", () => {
    expect(
      resolveGridBusinessKybLocalStatus({
        customer: {
          kybStatus: "PENDING",
          beneficialOwners: [{ kycStatus: "PENDING", roles: ["UBO"] }],
        },
        verifications: [{ verificationStatus: "IN_PROGRESS" }],
        documents: [],
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

  it("treats PENDING with BYO RESOLVE_ERRORS and complete hosted profile as in_progress until review", () => {
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
    ).toBe("in_progress")
  })

  it("does not treat company documents as UBO ID upload", () => {
    expect(
      resolveGridBusinessKybLocalStatus({
        customer: {
          kybStatus: "PENDING",
          beneficialOwners: [{ kycStatus: "PENDING" }],
        },
        verifications: [
          {
            verificationStatus: "RESOLVE_ERRORS",
            errors: [{ type: "MISSING_IDENTITY_DOCUMENT" }],
          },
        ],
        documents: [
          { documentType: "CERTIFICATE_OF_INCORPORATION", documentHolder: "Customer:1" },
        ],
      }),
    ).toBe("in_progress")
  })

  it("maps document-quality RESOLVE_ERRORS to hold even when an ID file exists", () => {
    expect(
      resolveGridBusinessKybLocalStatus({
        customer: {
          kybStatus: "PENDING",
          beneficialOwners: [{ id: "BeneficialOwner:1", kycStatus: "PENDING" }],
        },
        verifications: [
          {
            verificationStatus: "RESOLVE_ERRORS",
            errors: [
              { type: "POOR_QUALITY_DOCUMENT", reason: "The uploaded photo is of poor quality" },
              {
                type: "SUSPECTED_FRAUD_DOCUMENT",
                reason: "The uploaded image appears to be a screenshot rather than a photo of the document",
              },
            ],
          },
        ],
        documents: [{ documentType: "PASSPORT", documentHolder: "BeneficialOwner:1" }],
      }),
    ).toBe("hold")
  })

  it("treats PENDING with UBO identity document as pending even without a review webhook", () => {
    expect(
      resolveGridBusinessKybLocalStatus({
        customer: {
          kybStatus: "PENDING",
          beneficialOwners: [{ id: "BeneficialOwner:1", kycStatus: "PENDING" }],
        },
        verifications: [],
        documents: [{ documentType: "PASSPORT", documentHolder: "BeneficialOwner:1" }],
      }),
    ).toBe("pending")
  })

  it("keeps in_progress when Grid still reports MISSING_IDENTITY_DOCUMENT", () => {
    expect(
      resolveGridBusinessKybLocalStatus({
        customer: { kybStatus: "PENDING", beneficialOwners: [{ kycStatus: "PENDING" }] },
        verifications: [
          {
            verificationStatus: "RESOLVE_ERRORS",
            errors: [{ type: "MISSING_IDENTITY_DOCUMENT" }],
          },
        ],
        documents: [],
      }),
    ).toBe("in_progress")
  })

  it("treats PENDING with complete hosted profile and no verifications as in_progress", () => {
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
    ).toBe("in_progress")
  })
})

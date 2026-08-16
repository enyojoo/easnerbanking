import { describe, expect, it } from "vitest"
import {
  emptyGridKybCompanyDraft,
  mergeGridKybCompanyDraft,
  filterResolvedGridKybErrorPointers,
  firstGridKybErrorSection,
  GRID_KYB_ENTITY_TYPES,
  gridKybApplicationIsEditable,
  gridKybApplicationStatusFromVerification,
  gridKybWizardReadiness,
  mapGridKybVerificationErrors,
  resolveGridKybSourceOfFunds,
  sourceOfFundsIdFromStored,
} from "./grid-kyb-form"

describe("GRID_KYB_ENTITY_TYPES", () => {
  it("keeps Grid enum values and includes non-US legal-form search terms", () => {
    const values = GRID_KYB_ENTITY_TYPES.map((row) => row.value)
    expect(values).toEqual([
      "SOLE_PROPRIETORSHIP",
      "PARTNERSHIP",
      "LLC",
      "CORPORATION",
      "S_CORPORATION",
      "NON_PROFIT",
      "PUBLICLY_LISTED_COMPANY",
      "TRUST",
      "PRIVATE_FOUNDATION",
      "CHARITY",
      "OTHER",
    ])
    const llc = GRID_KYB_ENTITY_TYPES.find((row) => row.value === "LLC")
    expect(llc?.label).toMatch(/Ltd|GmbH/i)
    expect(llc?.aliases).toMatch(/GmbH/i)
    expect(llc?.aliases).toMatch(/SARL/i)
  })
})

describe("resolveGridKybSourceOfFunds", () => {
  it("maps a business option to Grid string + category", () => {
    expect(resolveGridKybSourceOfFunds({ id: "revenue_from_operations" })).toEqual({
      sourceOfFunds: "Revenue from operations",
      sourceOfFundsCategories: ["OPERATING_REVENUE"],
    })
  })

  it("sends Other description as sourceOfFunds", () => {
    expect(resolveGridKybSourceOfFunds({ id: "other", otherDescription: "Parent company loan" })).toEqual({
      sourceOfFunds: "Parent company loan",
      sourceOfFundsCategories: ["OTHER"],
      sourceOfFundsOtherDescription: "Parent company loan",
    })
  })
})

describe("sourceOfFundsIdFromStored", () => {
  it("round-trips known sentences", () => {
    expect(sourceOfFundsIdFromStored("Loan or credit")).toBe("loan_or_credit")
  })

  it("treats unknown sentences as other", () => {
    expect(sourceOfFundsIdFromStored("Revenue from consulting")).toBe("other")
  })
})

describe("mapGridKybVerificationErrors", () => {
  it("maps company fields, documents, and owner identity", () => {
    const pointers = mapGridKybVerificationErrors([
      {
        type: "MISSING_FIELD",
        field: "businessInfo.purposeOfAccount",
        reason: "Business purpose of account is required",
        resourceId: "Customer:1",
      },
      {
        type: "MISSING_OWNERSHIP_STRUCTURE_DOCUMENT",
        reason: "Ownership structure document is required",
        resourceId: "Customer:1",
        acceptedDocumentTypes: ["SHAREHOLDER_REGISTER"],
      },
      {
        type: "MISSING_IDENTITY_DOCUMENT",
        reason: "Identity document is required",
        resourceId: "BeneficialOwner:abc",
        acceptedDocumentTypes: ["PASSPORT"],
      },
    ])
    expect(pointers[0]).toMatchObject({
      section: "company",
      field: "businessInfo.purposeOfAccount",
    })
    expect(pointers[1]).toMatchObject({
      section: "documents",
      documentCategory: "ownership_structure",
      acceptedDocumentTypes: ["SHAREHOLDER_REGISTER"],
    })
    expect(pointers[2]).toMatchObject({
      section: "people",
      documentCategory: "identity",
      resourceId: "BeneficialOwner:abc",
    })
    expect(
      firstGridKybErrorSection([
        {
          type: "MISSING_FIELD",
          field: "businessInfo.purposeOfAccount",
          resourceId: "Customer:1",
        },
      ]),
    ).toBe("company")
  })
})

describe("gridKybApplicationStatusFromVerification", () => {
  it("treats RESOLVE_ERRORS as editable resolve_errors", () => {
    expect(
      gridKybApplicationStatusFromVerification({ verificationStatus: "RESOLVE_ERRORS" }),
    ).toBe("resolve_errors")
    expect(gridKybApplicationIsEditable("resolve_errors")).toBe(true)
    expect(gridKybApplicationIsEditable("in_review")).toBe(false)
  })

  it("treats pending manual review as in_review", () => {
    expect(
      gridKybApplicationStatusFromVerification({ verificationStatus: "PENDING_MANUAL_REVIEW" }),
    ).toBe("in_review")
  })
})

describe("mergeGridKybCompanyDraft", () => {
  it("keeps settings values when the saved draft is still empty", () => {
    const settings = { ...emptyGridKybCompanyDraft(), legalName: "Acme Ltd", city: "Berlin" }
    const saved = emptyGridKybCompanyDraft()
    expect(mergeGridKybCompanyDraft(settings, saved, "prefer-incoming")).toEqual(settings)
  })

  it("lets a saved draft overwrite empty settings fields only", () => {
    const settings = { ...emptyGridKybCompanyDraft(), legalName: "Acme Ltd" }
    const saved = { ...emptyGridKybCompanyDraft(), purposeOfAccount: "CONTRACTOR_PAYOUTS" }
    expect(mergeGridKybCompanyDraft(settings, saved, "prefer-incoming")).toMatchObject({
      legalName: "Acme Ltd",
      purposeOfAccount: "CONTRACTOR_PAYOUTS",
    })
  })
})

describe("filterResolvedGridKybErrorPointers", () => {
  it("drops company field pointers once the field is filled", () => {
    const remaining = filterResolvedGridKybErrorPointers({
      pointers: [
        { section: "company", field: "businessInfo.purposeOfAccount", reason: "Required" },
        { section: "company", field: "businessInfo.businessType", reason: "Required" },
      ],
      company: { ...emptyGridKybCompanyDraft(), purposeOfAccount: "CONTRACTOR_PAYOUTS" },
      people: [],
      documents: [],
    })
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.field).toBe("businessInfo.businessType")
  })

  it("drops document and identity pointers after uploads", () => {
    const remaining = filterResolvedGridKybErrorPointers({
      pointers: [
        { section: "documents", documentCategory: "ownership_structure", reason: "Required" },
        {
          section: "people",
          documentCategory: "identity",
          resourceId: "BeneficialOwner:abc",
          reason: "Required",
        },
      ],
      company: emptyGridKybCompanyDraft(),
      people: [{ id: "p1", gridBeneficialOwnerId: "abc", roles: [] }],
      documents: [
        { personId: null, category: "ownership_structure" },
        { personId: "p1", category: "identity" },
      ],
    })
    expect(remaining).toEqual([])
  })

  it("clears the Grid missing-identity pointer once the sole owner has an ID file", () => {
    const remaining = filterResolvedGridKybErrorPointers({
      pointers: mapGridKybVerificationErrors([
        {
          type: "MISSING_IDENTITY_DOCUMENT",
          reason: "Identity document is required",
          resourceId: "BeneficialOwner:019ff8c8-66cb-8887-0000-9dbe15c60c97",
          acceptedDocumentTypes: ["PASSPORT", "DRIVERS_LICENSE", "NATIONAL_ID"],
        },
      ]),
      company: emptyGridKybCompanyDraft(),
      people: [{ id: "p1", gridBeneficialOwnerId: null, roles: ["UBO"], firstName: "Ada", lastName: "Lovelace" }],
      documents: [{ personId: "p1", category: "identity" }],
    })
    expect(remaining).toEqual([])
  })

  it("clears people pointers even when Grid owner ids are not on the local draft yet", () => {
    const remaining = filterResolvedGridKybErrorPointers({
      pointers: [
        {
          section: "people",
          field: "personalInfo.address.country",
          resourceId: "BeneficialOwner:missing-locally",
          reason: "Country is required",
        },
        {
          section: "people",
          documentCategory: "identity",
          resourceId: "BeneficialOwner:missing-locally",
          reason: "Identity document is required",
        },
      ],
      company: emptyGridKybCompanyDraft(),
      people: [
        {
          id: "p1",
          gridBeneficialOwnerId: null,
          roles: ["UBO"],
          firstName: "Ada",
          lastName: "Lovelace",
          addressCountry: "GB",
          addressLine1: "1 Street",
          city: "London",
        },
      ],
      documents: [{ personId: "p1", category: "identity" }],
    })
    expect(remaining).toEqual([])
  })
})

describe("gridKybWizardReadiness", () => {
  it("is not submitted until the draft has owners and documents", () => {
    expect(
      gridKybWizardReadiness({
        status: "draft",
        remainingPointers: 0,
        company: { ...emptyGridKybCompanyDraft(), legalName: "Acme" },
        peopleCount: 0,
        hasIdentityDocument: false,
        hasCompanyDocument: false,
      }),
    ).toBe("not_submitted")
  })

  it("needs attention while pointers remain, then ready to submit", () => {
    const base = {
      status: "resolve_errors" as const,
      company: { ...emptyGridKybCompanyDraft(), legalName: "Acme" },
      peopleCount: 1,
      hasIdentityDocument: true,
      hasCompanyDocument: true,
    }
    expect(gridKybWizardReadiness({ ...base, remainingPointers: 2 })).toBe("needs_attention")
    expect(gridKybWizardReadiness({ ...base, remainingPointers: 0 })).toBe("ready_to_submit")
  })
})

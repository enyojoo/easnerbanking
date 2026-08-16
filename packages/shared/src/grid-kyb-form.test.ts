import { describe, expect, it } from "vitest"
import {
  firstGridKybErrorSection,
  GRID_KYB_ENTITY_TYPES,
  gridKybApplicationIsEditable,
  gridKybApplicationStatusFromVerification,
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
      sourceOfFundsCategories: ["SELF_EMPLOYMENT_INCOME"],
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

import { describe, expect, it } from "vitest"
import {
  emptyGridKybCompanyDraft,
  mergeGridKybCompanyDraft,
  filterResolvedGridKybErrorPointers,
  firstGridKybErrorSection,
  GRID_KYB_ENTITY_TYPES,
  GRID_KYB_ID_TYPES,
  gridKybApplicationIsEditable,
  gridKybApplicationStatusFromVerification,
  gridKybIdTypeOptionsForPerson,
  gridKybOwnerCountriesFromNationality,
  gridKybOwnerIdTypeForGrid,
  gridKybWizardReadiness,
  hasAllRequiredKybCompanyDocuments,
  hasReadyKybIdentityDocuments,
  gridKybIdentityDocumentRequiresSides,
  personKybIdentityDocumentsReady,
  isKybIdentityDocumentReady,
  withFirstKybOwnerUbo,
  mapGridKybVerificationErrors,
  gridKybSectionAttentionCounts,
  isGridMachineRejectionCode,
  normalizeGridKybIdType,
  normalizeGridKybOwnershipPercentageForGrid,
  allocateGridKybOwnershipPercentagesForGrid,
  parseGridKybOwnershipPercentageInput,
  resolveGridKybOwnerIdType,
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
      acceptedDocumentTypes: ["PASSPORT"],
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

  it("maps passport issuingAuthority errors onto People", () => {
    const pointers = mapGridKybVerificationErrors([
      {
        type: "MISSING_FIELD",
        field: "issuingAuthority",
        reason: "issuingAuthority is required for PASSPORT documents",
        resourceId: "Document:abc",
      },
    ])
    expect(pointers[0]).toMatchObject({
      section: "people",
      field: "issuingAuthority",
      documentCategory: "identity",
    })
  })

  it("points Document quality and fraud errors at People, not Company", () => {
    const documents = [
      {
        personId: "p1",
        category: "identity",
        gridDocumentId: "01a01f5a-0000-0000-0000-000000000001",
      },
    ]
    const errors = [
      {
        type: "POOR_QUALITY_DOCUMENT",
        reason: "The uploaded photo is of poor quality and appears edited with software.",
        resourceId: "Document:01a01f5a-0000-0000-0000-000000000001",
      },
      {
        type: "SUSPECTED_FRAUD_DOCUMENT",
        reason: "This image looks like a screenshot.",
        resourceId: "Document:01a01f5a-0000-0000-0000-000000000001",
      },
      {
        type: "MISSING_IDENTITY_DOCUMENT",
        reason: "Identity document is required",
        resourceId: "BeneficialOwner:01a01e60-e5d3-8887-0000-ff32c8090c49",
      },
    ]
    const pointers = mapGridKybVerificationErrors(errors, documents)
    expect(pointers.map((row) => row.section)).toEqual(["people", "people", "people"])
    expect(pointers[0]).toMatchObject({
      documentCategory: "identity",
      gridDocumentId: "01a01f5a-0000-0000-0000-000000000001",
    })
    expect(firstGridKybErrorSection(errors, documents)).toBe("people")
    expect(
      filterResolvedGridKybErrorPointers({
        pointers,
        company: emptyGridKybCompanyDraft(),
        people: [
          {
            id: "p1",
            gridBeneficialOwnerId: "01a01e60-e5d3-8887-0000-ff32c8090c49",
            roles: ["UBO"],
            firstName: "Anne",
            lastName: "Ayanbadejo",
          },
        ],
        documents,
      }),
    ).toHaveLength(3)

    const replaced = filterResolvedGridKybErrorPointers({
      pointers,
      company: emptyGridKybCompanyDraft(),
      people: [
        {
          id: "p1",
          gridBeneficialOwnerId: "01a01e60-e5d3-8887-0000-ff32c8090c49",
          roles: ["UBO"],
          firstName: "Anne",
          lastName: "Ayanbadejo",
        },
      ],
      documents: [{ personId: "p1", category: "identity", gridDocumentId: null }],
    })
    expect(replaced).toEqual([])
  })

  it("does not park unmapped company-without-field leftovers", () => {
    expect(
      filterResolvedGridKybErrorPointers({
        pointers: [{ section: "company", reason: "Unknown Grid error", resourceId: "Document:abc" }],
        company: emptyGridKybCompanyDraft(),
        people: [{ id: "p1", gridBeneficialOwnerId: "abc", roles: ["UBO"] }],
        documents: [{ personId: "p1", category: "identity" }],
      }),
    ).toEqual([])
  })
})

describe("gridKybSectionAttentionCounts", () => {
  it("counts unique owners, not every Grid error row", () => {
    expect(isGridMachineRejectionCode("badPhoto")).toBe(true)
    expect(isGridMachineRejectionCode("badDocument_suspiciousDocument")).toBe(true)
    expect(isGridMachineRejectionCode("The uploaded photo is of poor quality")).toBe(false)

    const pointers = mapGridKybVerificationErrors(
      [
        {
          resourceId: "Document:front-a",
          type: "POOR_QUALITY_DOCUMENT",
          reason: "The uploaded photo is of poor quality",
        },
        {
          resourceId: "Document:back-a",
          type: "SUSPECTED_FRAUD_DOCUMENT",
          reason: "The uploaded image appears to be a screenshot rather than a photo of the document",
        },
        {
          resourceId: "BeneficialOwner:owner-a",
          type: "APPLICANT_REJECTED",
          reason: "badPhoto",
        },
        {
          resourceId: "BeneficialOwner:owner-a",
          type: "APPLICANT_REJECTED",
          reason: "badPhoto_screenshot",
        },
        {
          resourceId: "Document:front-b",
          type: "SUSPECTED_FRAUD_DOCUMENT",
          reason: "The uploaded document appears suspicious",
        },
        {
          resourceId: "Document:back-b",
          type: "INVALID_DOCUMENT",
          reason: "The uploaded document is invalid",
        },
        {
          resourceId: "BeneficialOwner:owner-b",
          type: "APPLICANT_REJECTED",
          reason: "badDocument_suspiciousDocument",
        },
        {
          resourceId: "BeneficialOwner:owner-b",
          type: "APPLICANT_REJECTED",
          reason: "badDocument",
        },
      ],
      [
        { personId: "p1", category: "identity", gridDocumentId: "front-a" },
        { personId: "p1", category: "identity", gridDocumentId: "back-a" },
        { personId: "p2", category: "identity", gridDocumentId: "front-b" },
        { personId: "p2", category: "identity", gridDocumentId: "back-b" },
      ],
    )

    expect(pointers.every((row) => !isGridMachineRejectionCode(row.reason))).toBe(true)
    expect(
      gridKybSectionAttentionCounts({
        pointers,
        people: [
          { id: "p1", gridBeneficialOwnerId: "owner-a", roles: ["UBO"] },
          { id: "p2", gridBeneficialOwnerId: "owner-b", roles: ["UBO"] },
          { id: "p3", gridBeneficialOwnerId: "owner-c", roles: ["DIRECTOR"] },
        ],
        documents: [
          { personId: "p1", category: "identity", gridDocumentId: "front-a" },
          { personId: "p1", category: "identity", gridDocumentId: "back-a" },
          { personId: "p2", category: "identity", gridDocumentId: "front-b" },
          { personId: "p2", category: "identity", gridDocumentId: "back-b" },
        ],
      }).people,
    ).toBe(2)
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

  it("treats Grid review job states as in_review and not editable", () => {
    expect(
      gridKybApplicationStatusFromVerification({ verificationStatus: "IN_PROGRESS" }),
    ).toBe("in_review")
    expect(
      gridKybApplicationStatusFromVerification({ verificationStatus: "READY_FOR_VERIFICATION" }),
    ).toBe("in_review")
    expect(gridKybApplicationIsEditable("submitted")).toBe(false)
    expect(gridKybApplicationIsEditable("in_review")).toBe(false)
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

describe("parseGridKybOwnershipPercentageInput", () => {
  it("accepts whole numbers, decimals, and empty input", () => {
    expect(parseGridKybOwnershipPercentageInput("")).toBeNull()
    expect(parseGridKybOwnershipPercentageInput("33")).toBe(33)
    expect(parseGridKybOwnershipPercentageInput("33.3")).toBe(33.3)
    expect(parseGridKybOwnershipPercentageInput("33.34")).toBe(33.3)
    expect(parseGridKybOwnershipPercentageInput("100")).toBe(100)
  })

  it("rejects out-of-range values", () => {
    expect(() => parseGridKybOwnershipPercentageInput("-1")).toThrow("Ownership % must be between 0 and 100.")
    expect(() => parseGridKybOwnershipPercentageInput("101")).toThrow("Ownership % must be between 0 and 100.")
  })
})

describe("allocateGridKybOwnershipPercentagesForGrid", () => {
  it("preserves a three-way split that totals 100", () => {
    expect(allocateGridKybOwnershipPercentagesForGrid([33.4, 33.3, 33.3])).toEqual([34, 33, 33])
  })

  it("rounds a single owner normally", () => {
    expect(allocateGridKybOwnershipPercentagesForGrid([33.3])).toEqual([33])
    expect(allocateGridKybOwnershipPercentagesForGrid([50.5])).toEqual([51])
  })
})

describe("normalizeGridKybOwnershipPercentageForGrid", () => {
  it("rounds decimals before sending to Grid", () => {
    expect(normalizeGridKybOwnershipPercentageForGrid(33.3)).toBe(33)
    expect(normalizeGridKybOwnershipPercentageForGrid(33.6)).toBe(34)
  })
})

describe("resolveGridKybOwnerIdType", () => {
  it("maps cmdk-lowercased non_us_tax_id to Grid's enum", () => {
    expect(normalizeGridKybIdType("non_us_tax_id")).toBe("NON_US_TAX_ID")
    expect(normalizeGridKybIdType("Non-U.S. tax ID")).toBe("NON_US_TAX_ID")
  })

  it("uses tax ID country, not nationality, for the form value", () => {
    expect(
      resolveGridKybOwnerIdType({
        idType: "SSN",
        countryOfIssuance: "US",
      }),
    ).toBe("SSN")
    expect(
      resolveGridKybOwnerIdType({
        idType: "SSN",
        countryOfIssuance: "NG",
      }),
    ).toBe("NON_US_TAX_ID")
    expect(resolveGridKybOwnerIdType({ idType: "ITIN", countryOfIssuance: "US" })).toBe("ITIN")
  })

  it("still sends NON_US_TAX_ID to Grid when nationality is not US", () => {
    expect(
      gridKybOwnerIdTypeForGrid({
        idType: "SSN",
        countryOfIssuance: "US",
        nationality: "NG",
      }),
    ).toBe("NON_US_TAX_ID")
    expect(
      gridKybOwnerIdTypeForGrid({
        idType: "ITIN",
        countryOfIssuance: "US",
        nationality: "US",
      }),
    ).toBe("ITIN")
  })

  it("only offers Non-U.S. tax ID when the tax ID country is not US", () => {
    expect(gridKybIdTypeOptionsForPerson({ countryOfIssuance: "NG" }).map((row) => row.value)).toEqual([
      "NON_US_TAX_ID",
    ])
    expect(gridKybIdTypeOptionsForPerson({ countryOfIssuance: "US" }).map((row) => row.value)).toEqual([
      "SSN",
      "ITIN",
    ])
    expect(GRID_KYB_ID_TYPES.some((row) => row.value === "EIN")).toBe(false)
  })
})

describe("gridKybOwnerCountriesFromNationality", () => {
  it("copies nationality onto tax ID country and address country", () => {
    expect(gridKybOwnerCountriesFromNationality("ng")).toEqual({
      nationality: "NG",
      countryOfIssuance: "NG",
      addressCountry: "NG",
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

  it("keeps missing-identity until a rejected Grid file is replaced", () => {
    const pointers = mapGridKybVerificationErrors(
      [
        {
          type: "MISSING_IDENTITY_DOCUMENT",
          reason: "Identity document is required",
          resourceId: "BeneficialOwner:abc",
        },
        {
          type: "POOR_QUALITY_DOCUMENT",
          reason: "Poor quality",
          resourceId: "Document:rej-1",
        },
      ],
      [{ personId: "p1", category: "identity", gridDocumentId: "rej-1" }],
    )
    expect(
      filterResolvedGridKybErrorPointers({
        pointers,
        company: emptyGridKybCompanyDraft(),
        people: [{ id: "p1", gridBeneficialOwnerId: "abc", roles: ["UBO"] }],
        documents: [{ personId: "p1", category: "identity", gridDocumentId: "rej-1" }],
      }).some((row) => row.documentCategory === "identity"),
    ).toBe(true)
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
          postalCode: "SW1A 2AA",
        },
      ],
      documents: [{ personId: "p1", category: "identity" }],
    })
    expect(remaining).toEqual([])
  })

  it("keeps the NON_US_TAX_ID pointer until the owner is actually a non-US tax ID", () => {
    const pointers = mapGridKybVerificationErrors([
      {
        type: "INVALID_FIELD",
        field: "personalInfo.idType",
        reason: "Non-US beneficial owners must use NON_US_TAX_ID as the idType.",
        resourceId: "BeneficialOwner:abc",
      },
    ])
    expect(
      filterResolvedGridKybErrorPointers({
        pointers,
        company: emptyGridKybCompanyDraft(),
        people: [{ id: "p1", gridBeneficialOwnerId: "abc", roles: ["UBO"], idType: "SSN" }],
        documents: [],
      }),
    ).toHaveLength(1)
    expect(
      filterResolvedGridKybErrorPointers({
        pointers,
        company: emptyGridKybCompanyDraft(),
        people: [{ id: "p1", gridBeneficialOwnerId: "abc", roles: ["UBO"], nationality: "NG", idType: "SSN" }],
        documents: [],
      }),
    ).toEqual([])
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
        hasAllRequiredCompanyDocuments: false,
      }),
    ).toBe("not_submitted")
  })

  it("needs attention while pointers remain, then ready to submit", () => {
    const base = {
      status: "resolve_errors" as const,
      company: { ...emptyGridKybCompanyDraft(), legalName: "Acme" },
      peopleCount: 1,
      hasIdentityDocument: true,
      hasAllRequiredCompanyDocuments: true,
    }
    expect(gridKybWizardReadiness({ ...base, remainingPointers: 2 })).toBe("needs_attention")
    expect(gridKybWizardReadiness({ ...base, remainingPointers: 0 })).toBe("ready_to_submit")
  })

  it("stays not_submitted until every required company document is uploaded", () => {
    expect(
      gridKybWizardReadiness({
        status: "draft",
        remainingPointers: 0,
        company: { ...emptyGridKybCompanyDraft(), legalName: "Acme" },
        peopleCount: 1,
        hasIdentityDocument: true,
        hasAllRequiredCompanyDocuments: false,
      }),
    ).toBe("not_submitted")
  })

  it("requires a company file in each required category", () => {
    expect(
      hasAllRequiredKybCompanyDocuments([
        { category: "legal_presence", personId: null },
        { category: "identity", personId: "p1" },
      ]),
    ).toBe(false)
    expect(
      hasAllRequiredKybCompanyDocuments([
        { category: "legal_presence", personId: null },
        { category: "control_structure", personId: null },
        { category: "ownership_structure", personId: null },
        { category: "proof_of_address", personId: null },
      ]),
    ).toBe(true)
  })

  it("does not treat an identity file as ready without country, authority, and document number", () => {
    expect(
      isKybIdentityDocumentReady({
        category: "identity",
        personId: "p1",
        documentType: "PASSPORT",
        issuingCountry: "NG",
        issuingAuthority: "",
        documentNumber: "A12345678",
      }),
    ).toBe(false)
    expect(
      isKybIdentityDocumentReady({
        category: "identity",
        personId: "p1",
        documentType: "PASSPORT",
        issuingCountry: "NG",
        issuingAuthority: "Nigerian Immigration Service",
        documentNumber: "A12345678",
      }),
    ).toBe(true)
    expect(
      hasReadyKybIdentityDocuments(
        [{ id: "p1" }],
        [{ category: "identity", personId: "p1", documentType: "PASSPORT" }],
      ),
    ).toBe(false)
    expect(
      hasReadyKybIdentityDocuments(
        [{ id: "p1" }],
        [
          {
            category: "identity",
            personId: "p1",
            documentType: "PASSPORT",
            issuingCountry: "NG",
            issuingAuthority: "Nigerian Immigration Service",
            documentNumber: "A12345678",
          },
        ],
      ),
    ).toBe(true)
  })

  it("requires front and back uploads for US driver licenses", () => {
    expect(
      gridKybIdentityDocumentRequiresSides({
        documentType: "DRIVERS_LICENSE",
        issuingCountry: "US",
      }),
    ).toEqual(["FRONT", "BACK"])
    expect(
      gridKybIdentityDocumentRequiresSides({
        documentType: "PASSPORT",
        issuingCountry: "US",
      }),
    ).toBeNull()
    expect(
      personKybIdentityDocumentsReady("p1", [
        {
          category: "identity",
          personId: "p1",
          documentType: "DRIVERS_LICENSE",
          issuingCountry: "US",
          issuingAuthority: "California DMV",
          documentNumber: "D1234567",
          side: "FRONT",
        },
      ]),
    ).toBe(false)
    expect(
      personKybIdentityDocumentsReady("p1", [
        {
          category: "identity",
          personId: "p1",
          documentType: "DRIVERS_LICENSE",
          issuingCountry: "US",
          issuingAuthority: "California DMV",
          documentNumber: "D1234567",
          side: "FRONT",
        },
        {
          category: "identity",
          personId: "p1",
          documentType: "DRIVERS_LICENSE",
          issuingCountry: "US",
          issuingAuthority: "California DMV",
          documentNumber: "D1234567",
          side: "BACK",
        },
      ]),
    ).toBe(true)
  })

  it("adds UBO to the first owner when nobody has it", () => {
    expect(
      withFirstKybOwnerUbo([
        { id: "p1", roles: ["DIRECTOR", "CONTROL_PERSON"] },
        { id: "p2", roles: ["DIRECTOR"] },
      ]),
    ).toEqual([
      { id: "p1", roles: ["DIRECTOR", "CONTROL_PERSON", "UBO"] },
      { id: "p2", roles: ["DIRECTOR"] },
    ])
    expect(withFirstKybOwnerUbo([{ id: "p1", roles: ["UBO"] }])).toEqual([
      { id: "p1", roles: ["UBO"] },
    ])
  })

  it("stays needs_attention when Grid job is submitted but pointers remain", () => {
    expect(
      gridKybWizardReadiness({
        status: "submitted",
        remainingPointers: 1,
        company: { ...emptyGridKybCompanyDraft(), legalName: "Acme" },
        peopleCount: 1,
        hasIdentityDocument: true,
        hasAllRequiredCompanyDocuments: true,
      }),
    ).toBe("needs_attention")
  })
})

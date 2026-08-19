import { describe, expect, it } from "vitest"
import { emptyGridKybCompanyDraft } from "@easner/shared"
import { gridAddressFromKybCompany, gridAddressFromKybParts, gridBusinessInfoFromKybCompany } from "./kyb-company-to-grid"

describe("gridBusinessInfoFromKybCompany", () => {
  it("maps source of funds and arrays", () => {
    const company = emptyGridKybCompanyDraft()
    company.legalName = "Easner Group, Inc"
    company.sourceOfFundsId = "loan_or_credit"
    company.purposeOfAccount = "CROSS_BORDER_B2B"
    company.countriesOfOperation = ["us", "ng"]
    company.expectedRecipientJurisdictions = ["gb"]
    const info = gridBusinessInfoFromKybCompany(company)
    expect(info.sourceOfFunds).toBe("Loan or credit")
    expect(info.sourceOfFundsCategories).toEqual(["LOANS"])
    expect(info.countriesOfOperation).toEqual(["US", "NG"])
    expect(info.expectedRecipientJurisdictions).toEqual(["GB"])
  })
})

describe("gridAddressFromKybCompany", () => {
  it("requires line1, country, and postal", () => {
    const company = emptyGridKybCompanyDraft()
    company.addressLine1 = "584 Castro Street"
    company.postalCode = "94114"
    company.addressCountry = "US"
    expect(gridAddressFromKybCompany(company)).toMatchObject({
      line1: "584 Castro Street",
      postalCode: "94114",
      country: "US",
    })
  })
})

describe("gridAddressFromKybParts", () => {
  it("maps a Nigerian owner address without inventing US defaults", () => {
    expect(
      gridAddressFromKybParts({
        addressLine1: "12 Admiralty Way",
        addressLine2: "Victoria Island",
        city: "Lagos",
        state: "LA",
        postalCode: "101241",
        addressCountry: "ng",
      }),
    ).toEqual({
      line1: "12 Admiralty Way",
      line2: "Victoria Island",
      city: "Lagos",
      state: "LA",
      postalCode: "101241",
      country: "NG",
    })
  })

  it("omits incomplete addresses instead of substituting placeholders", () => {
    expect(
      gridAddressFromKybParts({
        addressLine1: "",
        city: "Lagos",
        postalCode: "",
        addressCountry: "NG",
      }),
    ).toBeNull()
  })
})

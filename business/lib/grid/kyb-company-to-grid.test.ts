import { describe, expect, it } from "vitest"
import { emptyGridKybCompanyDraft } from "@easner/shared"
import { gridAddressFromKybCompany, gridBusinessInfoFromKybCompany } from "./kyb-company-to-grid"

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

import { describe, expect, it } from "vitest"
import { extractIssuerBankDetails } from "./extract-issuer-bank-details"

describe("extractIssuerBankDetails", () => {
  it("reads string name and address", () => {
    const pm = {
      IssuerDetails: {
        Name: "SSB BANK",
        Address: "123 Main St, New York, NY",
      },
    }
    const out = extractIssuerBankDetails(pm)
    expect(out.bankName).toBe("SSB BANK")
    expect(out.bankAddress).toBe("123 Main St, New York, NY")
  })

  it("formats structured address objects", () => {
    const pm = {
      IssuerDetails: {
        Name: "Community Federal Savings Bank",
        Address: {
          Street: "89-16 JAMAICA AVE",
          City: "WOODHAVEN",
          State: "NY",
          PostCode: "11421",
          Country: "US",
        },
      },
    }
    const out = extractIssuerBankDetails(pm)
    expect(out.bankName).toBe("Community Federal Savings Bank")
    expect(out.bankAddress).toContain("JAMAICA AVE")
    expect(out.bankAddress).toContain("WOODHAVEN")
  })
})

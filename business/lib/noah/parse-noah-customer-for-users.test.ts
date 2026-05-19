import { describe, expect, it } from "vitest"
import {
  countryDisplayName,
  mapNoahIdTypeLabel,
  maskIdNumber,
  parseNoahCustomerForUsers,
  titleCaseName,
} from "./parse-noah-customer-for-users"

describe("parse-noah-customer-for-users", () => {
  it("parses FullName object from Noah webhooks", () => {
    const parsed = parseNoahCustomerForUsers({
      FullName: { FirstName: "SAMUEL", MiddleName: "ENYOJO", LastName: "ODIBA" },
      DateOfBirth: "1996-11-06",
      Verifications: { Status: "Approved" },
    })
    expect(parsed.full_name).toBe("Samuel Enyojo Odiba")
  })

  it("title-cases name and maps identity + address", () => {
    const parsed = parseNoahCustomerForUsers({
      FullName: "SAMUEL ENYOJO ODIBA",
      DateOfBirth: "1996-11-06",
      Identities: [{ IDType: "TaxID", IDNumber: "22380755976", IssuingCountry: "NG" }],
      PrimaryResidence: {
        Street: "39 PLOT, APO DUTSE",
        City: "ABUJA",
        State: "FCT",
        PostCode: "900108",
        Country: "NG",
      },
      Verifications: { Status: "Approved" },
      Occurred: "2025-01-15T10:00:00Z",
    })
    expect(parsed.full_name).toBe("Samuel Enyojo Odiba")
    expect(parsed.date_of_birth).toBe("1996-11-06")
    expect(parsed.kyc_id_type).toBe("TaxID")
    expect(parsed.kyc_id_number).toBe("22380755976")
    expect(parsed.kyc_id_issuing_country).toBe("NG")
    expect(parsed.kyc_address_street).toBe("39 Plot, Apo Dutse")
    expect(parsed.kyc_address_country).toBe("NG")
    expect(parsed.kyc_verified_at).toBeTruthy()
  })

  it("masks id number", () => {
    expect(maskIdNumber("22380755976")).toBe("•••••5976")
  })

  it("maps id type labels", () => {
    expect(mapNoahIdTypeLabel("TaxID")).toBe("Tax ID")
    expect(mapNoahIdTypeLabel("Passport")).toBe("Passport")
  })

  it("resolves country display name", () => {
    expect(countryDisplayName("NG")).toMatch(/Nigeria/i)
  })

  it("titleCaseName handles empty", () => {
    expect(titleCaseName("")).toBe("")
  })
})

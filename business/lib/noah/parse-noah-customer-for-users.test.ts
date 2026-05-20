import { describe, expect, it } from "vitest"
import {
  buildVerifiedIdentityFromKycFields,
  formatMaskedIdForDisplay,
  formatVerifiedAddressDisplay,
} from "../../../packages/shared/src/verified-identity"
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
      FullName: { FirstName: "JANE", MiddleName: "QUINN", LastName: "PUBLIC" },
      DateOfBirth: "1996-11-06",
      Verifications: { Status: "Approved" },
    })
    expect(parsed.full_name).toBe("Jane Quinn Public")
  })

  it("title-cases name and maps identity + address", () => {
    const parsed = parseNoahCustomerForUsers({
      FullName: "JANE Q PUBLIC",
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
    expect(parsed.full_name).toBe("Jane Quinn Public")
    expect(parsed.date_of_birth).toBe("1996-11-06")
    expect(parsed.kyc_id_type).toBe("TaxID")
    expect(parsed.kyc_id_number).toBe("22380755976")
    expect(parsed.kyc_id_issuing_country).toBe("NG")
    expect(parsed.kyc_address_street).toBe("39 Plot, Apo Dutse")
    expect(parsed.kyc_address_country).toBe("NG")
    expect(parsed.kyc_verified_at).toBeTruthy()
  })

  it("masks id number", () => {
    expect(maskIdNumber("22380755976")).toBe("2238•••5976")
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

  it("buildVerifiedIdentityFromKycFields when approved with id", () => {
    const v = buildVerifiedIdentityFromKycFields({
      noah_kyc_status: "approved",
      kyc_verified_at: "2025-01-01T00:00:00Z",
      kyc_id_type: "Passport",
      kyc_id_number: "22380755976",
      kyc_id_issuing_country: "NG",
    })
    expect(v.visible).toBe(true)
    expect(v.idType).toBe("Passport")
    expect(v.idNumberMasked).toBe("2238•••5976")
    expect(v.issuingCountry?.code).toBe("NG")
  })

  it("buildVerifiedIdentityFromKycFields hidden when not approved", () => {
    expect(buildVerifiedIdentityFromKycFields({ noah_kyc_status: "pending" }).visible).toBe(false)
  })

  it("formatMaskedIdForDisplay adds spacing", () => {
    expect(formatMaskedIdForDisplay("2238•••5976")).toBe("2238 • • • 5976")
  })

  it("formatVerifiedAddressDisplay is one comma-separated line", () => {
    expect(
      formatVerifiedAddressDisplay({
        addressLines: [
          "39 Plot, Apo Dutse, Before Cedar Crest Hospital, Gudu Service Centers",
          "FCT, Abuja, 900108",
        ],
        addressCountry: { code: "NG", name: "Nigeria" },
      }),
    ).toBe(
      "39 Plot, Apo Dutse, Before Cedar Crest Hospital, Gudu Service Centers, FCT, Abuja, 900108, Nigeria",
    )
  })
})

import { describe, expect, it } from "vitest"
import {
  emptyKybOwnerFromPersonal,
  mergeKybPersonFromPersonal,
  splitPersonalFullName,
} from "./prefill-kyb-owner-from-personal"

const personal = {
  fullName: "Dona Donny",
  email: "info@cortexforge.space",
  phone: "",
  dateOfBirth: "1990-06-05",
  residenceCountry: "ID",
  kycAddressStreet: "JL. M.A. SELATAN",
  kycAddressCity: "MEDAN",
  kycAddressState: "SU",
  kycAddressPostCode: "20216",
  kycAddressCountry: "Indonesia",
  kycIdType: "Tax ID",
  kycIdNumber: "1271100506900003",
  kycIdIssuingCountry: "Indonesia",
}

describe("prefill kyb owner from personal settings", () => {
  it("splits a two-part personal name", () => {
    expect(splitPersonalFullName("Dona Donny")).toEqual({ firstName: "Dona", lastName: "Donny" })
  })

  it("fills empty owner fields from personal settings", () => {
    const merged = emptyKybOwnerFromPersonal(personal)
    expect(merged).toMatchObject({
      firstName: "Dona",
      lastName: "Donny",
      email: "info@cortexforge.space",
      birthDate: "1990-06-05",
      nationality: "ID",
      addressLine1: "JL. M.A. SELATAN",
      city: "MEDAN",
      postalCode: "20216",
      addressCountry: "ID",
      idType: "NON_US_TAX_ID",
      identifier: "1271100506900003",
      countryOfIssuance: "ID",
    })
  })

  it("does not overwrite existing owner fields", () => {
    const merged = mergeKybPersonFromPersonal(
      {
        firstName: "DONA",
        lastName: "DONNY",
        email: "owner@example.com",
        phone: "",
        birthDate: "1990-06-05",
        nationality: "ID",
        addressLine1: "Existing street",
        city: "MEDAN",
        state: "SU",
        postalCode: "20216",
        addressCountry: "ID",
        idType: "NON_US_TAX_ID",
        identifier: "existing",
        countryOfIssuance: "ID",
        roles: ["UBO"],
        ownershipPercentage: 100,
      },
      personal,
    )
    expect(merged.firstName).toBe("DONA")
    expect(merged.email).toBe("owner@example.com")
    expect(merged.addressLine1).toBe("Existing street")
    expect(merged.identifier).toBe("existing")
  })
})

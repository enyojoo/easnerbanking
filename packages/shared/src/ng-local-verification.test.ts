import { describe, expect, it } from "vitest"
import {
  buildNgYcIdPair,
  isValidNgLocalIdNumber,
  mapNoahKycIdTypeToNgLocal,
  ngLocalVerificationComplete,
  resolveNgLocalVerification,
  showNgSupplementPrompt,
  ycLocalRailsOfferedForNg,
} from "./ng-local-verification"

describe("mapNoahKycIdTypeToNgLocal", () => {
  it("maps TaxID to BVN and NationalID to NIN", () => {
    expect(mapNoahKycIdTypeToNgLocal("TaxID")).toBe("BVN")
    expect(mapNoahKycIdTypeToNgLocal("NationalID")).toBe("NIN")
    expect(mapNoahKycIdTypeToNgLocal("NationalIDCard")).toBe("NIN")
  })
})

describe("resolveNgLocalVerification", () => {
  it("needs NIN when Noah has BVN", () => {
    const s = resolveNgLocalVerification({
      kycIdType: "TaxID",
      kycIdNumber: "12345678901",
    })
    expect(s.hasBvn).toBe(true)
    expect(s.hasNin).toBe(false)
    expect(s.missingType).toBe("NIN")
    expect(s.complete).toBe(false)
  })

  it("completes when supplement fills the other ID", () => {
    const s = resolveNgLocalVerification({
      kycIdType: "NationalID",
      kycIdNumber: "12345678901",
      ngLocalIdType: "BVN",
      ngLocalIdNumber: "10987654321",
    })
    expect(s.complete).toBe(true)
    expect(ngLocalVerificationComplete(s as never)).toBe(false) // wrong shape – use profile
    expect(
      ngLocalVerificationComplete({
        kycIdType: "NationalID",
        kycIdNumber: "12345678901",
        ngLocalIdType: "BVN",
        ngLocalIdNumber: "10987654321",
      }),
    ).toBe(true)
  })

  it("rejects non-11-digit numbers", () => {
    expect(isValidNgLocalIdNumber("123")).toBe(false)
    const s = resolveNgLocalVerification({
      kycIdType: "TaxID",
      kycIdNumber: "123",
      ngLocalIdType: "NIN",
      ngLocalIdNumber: "12345678901",
    })
    expect(s.hasBvn).toBe(false)
    expect(s.hasNin).toBe(true)
  })
})

describe("buildNgYcIdPair", () => {
  it("puts Noah ID as primary", () => {
    const pair = buildNgYcIdPair({
      kycIdType: "TaxID",
      kycIdNumber: "12345678901",
      ngLocalIdType: "NIN",
      ngLocalIdNumber: "10987654321",
    })
    expect(pair).toEqual({
      idType: "BVN",
      idNumber: "12345678901",
      additionalIdType: "NIN",
      additionalIdNumber: "10987654321",
    })
  })
})

describe("showNgSupplementPrompt", () => {
  it("only for NG + YC rails + incomplete", () => {
    expect(ycLocalRailsOfferedForNg({ ycReceiveEnabledForNg: true })).toBe(true)
    expect(
      showNgSupplementPrompt(
        { residenceCountry: "NG", kycIdType: "TaxID", kycIdNumber: "12345678901" },
        { ycReceiveEnabledForNg: true },
      ),
    ).toBe(true)
    expect(
      showNgSupplementPrompt(
        { residenceCountry: "US", kycIdType: "TaxID", kycIdNumber: "12345678901" },
        { ycReceiveEnabledForNg: true },
      ),
    ).toBe(false)
    expect(
      showNgSupplementPrompt(
        { residenceCountry: "NG", kycIdType: "TaxID", kycIdNumber: "12345678901" },
        { ycReceiveEnabledForNg: false },
      ),
    ).toBe(false)
  })
})

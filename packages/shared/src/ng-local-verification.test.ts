import { describe, expect, it } from "vitest"
import {
  buildNgYcIdPair,
  encodeNgLocalIdPair,
  isValidNgLocalIdNumber,
  mapNoahKycIdTypeToNgLocal,
  NG_LOCAL_ID_PAIR,
  ngLocalVerificationComplete,
  ngSupplementInlinePrompt,
  parseNgLocalIdPair,
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

  it("maps Grid owner Tax ID labels to BVN", () => {
    expect(mapNoahKycIdTypeToNgLocal("Tax ID")).toBe("BVN")
    expect(mapNoahKycIdTypeToNgLocal("NON_US_TAX_ID")).toBe("BVN")
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
    expect(s.missingTypes).toEqual(["NIN"])
    expect(s.complete).toBe(false)
  })

  it("needs both when Noah has neither", () => {
    const s = resolveNgLocalVerification({})
    expect(s.missingTypes).toEqual(["NIN", "BVN"])
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
    expect(s.missingTypes).toEqual([])
    expect(
      ngLocalVerificationComplete({
        kycIdType: "NationalID",
        kycIdNumber: "12345678901",
        ngLocalIdType: "BVN",
        ngLocalIdNumber: "10987654321",
      }),
    ).toBe(true)
  })

  it("completes from PAIR when both were collected together", () => {
    const s = resolveNgLocalVerification({
      ngLocalIdType: NG_LOCAL_ID_PAIR,
      ngLocalIdNumber: encodeNgLocalIdPair("12345678901", "10987654321"),
    })
    expect(s.complete).toBe(true)
    expect(s.hasNin).toBe(true)
    expect(s.hasBvn).toBe(true)
    expect(s.missingTypes).toEqual([])
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

describe("parseNgLocalIdPair", () => {
  it("round-trips encode/parse", () => {
    const encoded = encodeNgLocalIdPair("12345678901", "10987654321")
    expect(parseNgLocalIdPair(encoded)).toEqual({
      nin: "12345678901",
      bvn: "10987654321",
    })
  })
})

describe("ngSupplementInlinePrompt", () => {
  it("uses both copy when both missing", () => {
    expect(ngSupplementInlinePrompt(["NIN", "BVN"])).toContain("NIN and BVN")
    expect(ngSupplementInlinePrompt("BVN")).toContain("BVN")
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

  it("builds pair from PAIR supplement alone", () => {
    const pair = buildNgYcIdPair({
      ngLocalIdType: NG_LOCAL_ID_PAIR,
      ngLocalIdNumber: encodeNgLocalIdPair("12345678901", "10987654321"),
    })
    expect(pair).toEqual({
      idType: "NIN",
      idNumber: "12345678901",
      additionalIdType: "BVN",
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

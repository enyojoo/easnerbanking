import { describe, expect, it } from "vitest"
import { resolveJurisdictionAllowlist } from "./jurisdiction-country-policy"
import {
  isBlockedForBusiness,
  isBlockedForMobile,
  isGridDigitalAssetJurisdiction,
} from "./jurisdiction-blocked-countries"

describe("signup allowlist regression", () => {
  const catalog = ["NG", "KE", "MA", "GB", "PA", "UA", "QA", "IR", "US", "DZ", "CN"]

  it("Business allowlist drops Grid hard blocks and keeps MA/GB/PA/UA/digital-asset", () => {
    const allowed = resolveJurisdictionAllowlist(null, catalog)
    expect(allowed).toContain("MA")
    expect(allowed).toContain("GB")
    expect(allowed).toContain("PA")
    expect(allowed).toContain("UA")
    expect(allowed).toContain("DZ")
    expect(allowed).toContain("CN")
    expect(allowed).toContain("NG")
    expect(allowed).not.toContain("KE")
    expect(allowed).not.toContain("QA")
    expect(allowed).not.toContain("IR")
  })

  it("Mobile helpers match expected signup matrix", () => {
    expect(isBlockedForMobile("KE")).toBe(false)
    expect(isBlockedForMobile("MA")).toBe(false)
    expect(isBlockedForMobile("GB")).toBe(true)
    expect(isBlockedForMobile("PA")).toBe(true)
    expect(isBlockedForMobile("UA")).toBe(true)
  })

  it("digital-asset extras never block Business or Mobile signup helpers", () => {
    for (const code of ["DZ", "BD", "CN", "MA", "NP"] as const) {
      expect(isBlockedForBusiness(code)).toBe(false)
      expect(isBlockedForMobile(code)).toBe(false)
      expect(isGridDigitalAssetJurisdiction(code)).toBe(true)
    }
  })

  it("helpers never throw on bad input", () => {
    expect(() => isBlockedForBusiness(null)).not.toThrow()
    expect(() => isBlockedForMobile("")).not.toThrow()
    expect(() => isGridDigitalAssetJurisdiction("12")).not.toThrow()
    expect(() => resolveJurisdictionAllowlist(null, [])).not.toThrow()
  })
})

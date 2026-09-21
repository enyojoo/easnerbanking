import { describe, expect, it } from "vitest"
import {
  filterCountriesForProductPicker,
  isBlockedForBusiness,
  isBlockedForMobile,
  isGridDigitalAssetJurisdiction,
} from "./jurisdiction-blocked-countries"

describe("signup jurisdiction regression", () => {
  const catalog = ["NG", "KE", "MA", "GB", "PA", "UA", "QA", "IR", "US", "DZ", "CN"].map(
    (code) => ({ code, name: code }),
  )

  it("Business picker drops Grid hard blocks and keeps MA/GB/PA/UA/digital-asset", () => {
    const business = filterCountriesForProductPicker(catalog, "business").map((r) => r.code)
    expect(business).toContain("MA")
    expect(business).toContain("GB")
    expect(business).toContain("PA")
    expect(business).toContain("UA")
    expect(business).toContain("DZ")
    expect(business).toContain("CN")
    expect(business).toContain("NG")
    expect(business).not.toContain("KE")
    expect(business).not.toContain("QA")
    expect(business).not.toContain("IR")
  })

  it("Mobile picker strips Noah hard blocks and keeps KE/MA", () => {
    const mobile = filterCountriesForProductPicker(catalog, "mobile").map((r) => r.code)
    expect(mobile).toContain("KE")
    expect(mobile).toContain("MA")
    expect(mobile).not.toContain("GB")
    expect(mobile).not.toContain("PA")
    expect(mobile).not.toContain("UA")
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

  it("keeps Bangladesh on both signup pickers", () => {
    const catalog = [{ code: "BD", name: "Bangladesh" }]
    expect(filterCountriesForProductPicker(catalog, "business").map((r) => r.code)).toEqual(["BD"])
    expect(filterCountriesForProductPicker(catalog, "mobile").map((r) => r.code)).toEqual(["BD"])
  })

  it("helpers never throw on bad input", () => {
    expect(() => isBlockedForBusiness(null)).not.toThrow()
    expect(() => isBlockedForMobile("")).not.toThrow()
    expect(() => isGridDigitalAssetJurisdiction("12")).not.toThrow()
    expect(() => filterCountriesForProductPicker([], "business")).not.toThrow()
  })
})

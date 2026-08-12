import { describe, expect, it } from "vitest"
import {
  GRID_DIGITAL_ASSET_EXTRA_ISO2,
  GRID_PROHIBITED_RESIDENCE_ISO2,
  NOAH_FULLY_PROHIBITED_VA_ISO2,
  filterBlockedJurisdictionsForProduct,
  isBlockedForBusiness,
  isBlockedForMobile,
  isEasnerBlockedJurisdiction,
  isGridDigitalAssetJurisdiction,
} from "./jurisdiction-blocked-countries"

describe("jurisdiction-blocked-countries", () => {
  it("never throws on null/empty/invalid input", () => {
    expect(isBlockedForBusiness(null)).toBe(false)
    expect(isBlockedForBusiness("")).toBe(false)
    expect(isBlockedForBusiness("x")).toBe(false)
    expect(isBlockedForMobile(undefined)).toBe(false)
    expect(isGridDigitalAssetJurisdiction("")).toBe(false)
  })

  it("normalizes case for lookups", () => {
    expect(isBlockedForBusiness("ke")).toBe(true)
    expect(isBlockedForMobile("gb")).toBe(true)
    expect(isGridDigitalAssetJurisdiction("ma")).toBe(true)
  })

  it("Business blocks Grid main (KE) and allows MA/GB/PA/UA", () => {
    expect(isBlockedForBusiness("KE")).toBe(true)
    expect(isBlockedForBusiness("QA")).toBe(true)
    expect(isBlockedForBusiness("IR")).toBe(true)
    expect(isBlockedForBusiness("MA")).toBe(false)
    expect(isBlockedForBusiness("GB")).toBe(false)
    expect(isBlockedForBusiness("PA")).toBe(false)
    expect(isBlockedForBusiness("UA")).toBe(false)
    expect(isEasnerBlockedJurisdiction("KE")).toBe(true)
    expect(isEasnerBlockedJurisdiction("MA")).toBe(false)
  })

  it("Mobile blocks Noah fully prohibited incl GB; allows KE/MA", () => {
    expect(isBlockedForMobile("GB")).toBe(true)
    expect(isBlockedForMobile("PA")).toBe(true)
    expect(isBlockedForMobile("UA")).toBe(true)
    expect(isBlockedForMobile("KE")).toBe(false)
    expect(isBlockedForMobile("MA")).toBe(false)
    expect(isBlockedForMobile("QA")).toBe(false)
  })

  it("digital-asset extras are signup-allowed on both products", () => {
    for (const code of GRID_DIGITAL_ASSET_EXTRA_ISO2) {
      expect(GRID_PROHIBITED_RESIDENCE_ISO2.includes(code as never)).toBe(false)
      expect(NOAH_FULLY_PROHIBITED_VA_ISO2.includes(code as never)).toBe(false)
      expect(isBlockedForBusiness(code)).toBe(false)
      expect(isBlockedForMobile(code)).toBe(false)
      expect(isGridDigitalAssetJurisdiction(code)).toBe(true)
    }
  })

  it("filters allowlists by product", () => {
    const codes = ["NG", "KE", "MA", "GB", "PA"]
    expect(filterBlockedJurisdictionsForProduct("business", codes)).toEqual(["NG", "MA", "GB", "PA"])
    expect(filterBlockedJurisdictionsForProduct("mobile", codes)).toEqual(["NG", "KE", "MA"])
  })
})

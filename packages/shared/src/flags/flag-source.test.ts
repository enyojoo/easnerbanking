import { describe, expect, it } from "vitest"
import { flagIsoForCurrency, hasFlagAsset, normalizeFlagIso } from "./flag-source"

describe("flagIsoForCurrency", () => {
  it("maps EUR to EU for bundled flag assets", () => {
    expect(flagIsoForCurrency("EUR")).toBe("EU")
    expect(flagIsoForCurrency("eur")).toBe("EU")
  })

  it("maps USD to US", () => {
    expect(flagIsoForCurrency("USD")).toBe("US")
  })
})

describe("hasFlagAsset", () => {
  it("includes EU and EE as distinct bundled flags", () => {
    expect(hasFlagAsset("EU")).toBe(true)
    expect(hasFlagAsset("EE")).toBe(true)
    expect(normalizeFlagIso("eu")).toBe("EU")
  })
})

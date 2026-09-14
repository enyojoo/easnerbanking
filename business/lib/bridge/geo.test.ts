import { describe, expect, it } from "vitest"
import { isBridgeNewYorkResidence, isBridgeOnboardableResidence } from "@easner/shared"

describe("isBridgeOnboardableResidence", () => {
  it("blocks New York and prohibited countries", () => {
    expect(isBridgeNewYorkResidence({ countryCode: "US", state: "NY" })).toBe(true)
    expect(isBridgeOnboardableResidence({ countryCode: "US", state: "NY" })).toBe(false)
    expect(isBridgeOnboardableResidence({ countryCode: "US", state: "CA" })).toBe(true)
    expect(isBridgeOnboardableResidence({ countryCode: "DE" })).toBe(true)
    expect(isBridgeOnboardableResidence({ countryCode: "IR" })).toBe(false)
  })
})

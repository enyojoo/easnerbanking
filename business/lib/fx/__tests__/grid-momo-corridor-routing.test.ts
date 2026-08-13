import { describe, expect, it } from "vitest"
import { listGridMomoOnlyCorridorPairs } from "@easner/shared"

describe("listGridMomoOnlyCorridorPairs", () => {
  it("includes RW and UG", () => {
    const pairs = listGridMomoOnlyCorridorPairs()
    expect(pairs).toEqual(
      expect.arrayContaining([
        { countryCode: "RW", currencyCode: "RWF" },
        { countryCode: "UG", currencyCode: "UGX" },
      ]),
    )
  })
})

describe("mergeGridRouting behavior", () => {
  it("documents momo-only corridor keys", () => {
    const codes = listGridMomoOnlyCorridorPairs().map((p) => `${p.countryCode}:${p.currencyCode}`)
    expect(codes).toContain("KE:KES")
    expect(codes).not.toContain("GH:GHS")
  })
})

import { describe, expect, it } from "vitest"
import { formatPostalAddressBlock, hasPostalAddressParts } from "./postal-address"

describe("formatPostalAddressBlock", () => {
  it("formats street, locality, and country on separate lines", () => {
    expect(
      formatPostalAddressBlock({
        line1: "131 Continental Dr Suite 305",
        city: "Newark",
        state: "DE",
        postalCode: "19713",
        country: "United States",
      }),
    ).toBe("131 Continental Dr Suite 305\nNewark, DE 19713\nUnited States")
  })
})

describe("hasPostalAddressParts", () => {
  it("is true when any component is present", () => {
    expect(hasPostalAddressParts({ city: "Newark" })).toBe(true)
    expect(hasPostalAddressParts({})).toBe(false)
  })
})

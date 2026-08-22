import { describe, expect, it } from "vitest"
import { isStripeOnrampPayerEligible } from "@easner/shared"

describe("onramp geo office combination", () => {
  it("US LLC + NG owner is not eligible", () => {
    expect(isStripeOnrampPayerEligible({ country: "NG" })).toBe(false)
  })
})

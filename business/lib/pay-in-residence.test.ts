import { describe, expect, it } from "vitest"
import { effectivePayInCountry } from "./pay-in-residence"

describe("effectivePayInCountry", () => {
  it("prefers business country when set", () => {
    expect(
      effectivePayInCountry({
        businessCountryCode: "UG",
        userResidenceCountry: "KE",
      }),
    ).toBe("UG")
  })

  it("falls back to user residence when business country is unset", () => {
    expect(
      effectivePayInCountry({
        businessCountryCode: "  ",
        userResidenceCountry: "ke",
      }),
    ).toBe("KE")
  })
})

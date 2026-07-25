import { describe, expect, it } from "vitest"
import { resolveGridPayInLimits, resolveGridPayoutLimits } from "./grid-limits"

describe("resolveGridPayInLimits", () => {
  it("applies receive fallback and business min for NG NGN bank", () => {
    expect(
      resolveGridPayInLimits({
        country: "NG",
        currency: "NGN",
        rail: "bank_transfer",
      }),
    ).toEqual({ minLocalPayIn: 2500, maxLocalPayIn: 5_000_000 })
  })

  it("applies business min for enabled Grid corridors without YC channel", () => {
    expect(
      resolveGridPayInLimits({
        country: "AE",
        currency: "AED",
        rail: "bank_transfer",
      }),
    ).toEqual({ minLocalPayIn: 20, maxLocalPayIn: null })
  })

  it("applies business min when corridor fallback is absent", () => {
    expect(
      resolveGridPayInLimits({
        country: "GH",
        currency: "GHS",
        rail: "mobile_money",
      }),
    ).toEqual({ minLocalPayIn: 20, maxLocalPayIn: null })
  })
})

describe("resolveGridPayoutLimits", () => {
  it("applies send fallback and business min for NG NGN bank", () => {
    expect(
      resolveGridPayoutLimits({
        country: "NG",
        currency: "NGN",
        rail: "bank_transfer",
      }),
    ).toEqual({
      minSendUsd: 1.01,
      minLocalReceive: 2000,
      maxLocalReceive: 30_000_000,
    })
  })

  it("applies Grid API minimum for PH PHP bank", () => {
    expect(
      resolveGridPayoutLimits({
        country: "PH",
        currency: "PHP",
        rail: "bank_transfer",
      }),
    ).toEqual({
      minSendUsd: 1.01,
      minLocalReceive: 100,
      maxLocalReceive: null,
    })
  })
})

import { describe, expect, it } from "vitest"
import {
  getGridUsdBankPaymentInstructions,
  getPaymentInstructions,
} from "./payment-instructions"

describe("getGridUsdBankPaymentInstructions", () => {
  it("returns Grid USD rails copy with SWIFT unsupported and per-rail timing", () => {
    expect(getGridUsdBankPaymentInstructions()).toEqual([
      "Only send via ACH, Wire, RTP, or FedNow.",
      "SWIFT is not supported.",
      "Processing: RTP & FedNow (instant), ACH & Wire (up to 48 hours).",
    ])
  })
})

describe("getPaymentInstructions", () => {
  it("uses Grid USD copy when gridUsd option is set", () => {
    expect(getPaymentInstructions("USD", "bank", { gridUsd: true })).toEqual(
      getGridUsdBankPaymentInstructions(),
    )
  })

  it("uses Bridge USD copy when usdProvider is bridge", () => {
    expect(getPaymentInstructions("USD", "bank", { usdProvider: "bridge" })).toContain(
      "Only send via ACH, Wire, or FedNow.",
    )
  })

  it("keeps legacy Noah USD copy when no USD provider is set", () => {
    expect(getPaymentInstructions("USD", "bank")).toContain("Only send ACH or Fedwire.")
  })
})

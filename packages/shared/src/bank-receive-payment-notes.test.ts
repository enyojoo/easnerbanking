import { describe, expect, it } from "vitest"
import { bankReceivePaymentNotes, usdBankReceivePaymentNotes } from "./bank-receive-payment-notes"

describe("usdBankReceivePaymentNotes", () => {
  it("lists RTP and FedNow for Grid", () => {
    expect(usdBankReceivePaymentNotes("grid")).toEqual([
      "Only send via ACH, Wire, RTP, or FedNow.",
      "SWIFT is not supported.",
      "Processing: RTP & FedNow (instant), ACH & Wire (up to 48 hours).",
    ])
  })

  it("lists FedNow without RTP for Bridge", () => {
    expect(usdBankReceivePaymentNotes("bridge")).toEqual([
      "Only send via ACH, Wire, or FedNow.",
      "SWIFT is not supported.",
      "Processing: FedNow (instant), ACH & Wire (up to 48 hours).",
    ])
  })

  it("keeps ACH or Fedwire for Noah and unknown", () => {
    expect(usdBankReceivePaymentNotes("noah")[0]).toBe("Only send ACH or Fedwire.")
    expect(usdBankReceivePaymentNotes(undefined)[0]).toBe("Only send ACH or Fedwire.")
  })
})

describe("bankReceivePaymentNotes", () => {
  it("uses Bridge USD copy when provider is bridge", () => {
    expect(bankReceivePaymentNotes({ currency: "USD", provider: "bridge" })[0]).toBe(
      "Only send via ACH, Wire, or FedNow.",
    )
  })

  it("keeps SEPA copy for EUR", () => {
    expect(bankReceivePaymentNotes({ currency: "EUR", provider: "bridge" })[0]).toBe(
      "Only send SEPA and SEPA Instant.",
    )
  })
})

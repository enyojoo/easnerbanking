import { describe, expect, it } from "vitest"
import {
  formatStablecoinDepositSchemeLabel,
  receiveStablecoinDepositSubtitle,
  receiveStablecoinPaymentNotes,
} from "./stablecoin-deposit-scheme"

describe("formatStablecoinDepositSchemeLabel", () => {
  it("formats USDC on Solana from asset and chain", () => {
    expect(
      formatStablecoinDepositSchemeLabel({
        asset: "USDC",
        chain: "solana",
      }),
    ).toBe("USDC on Solana")
  })

  it("formats USDT on Tron", () => {
    expect(
      formatStablecoinDepositSchemeLabel({
        sourceCurrency: "USDT",
        paymentRail: "tron",
      }),
    ).toBe("USDT on Tron")
  })

  it("formats EURC on Solana", () => {
    expect(
      formatStablecoinDepositSchemeLabel({
        sourceCurrency: "EURC",
        paymentRail: "solana",
      }),
    ).toBe("EURC on Solana")
  })
})

describe("receiveStablecoinDepositSubtitle", () => {
  it("mirrors cash deposit copy for USDC", () => {
    expect(
      receiveStablecoinDepositSubtitle({ asset: "USDC", network: "Solana" }),
    ).toBe("Deposit USDC to credit your USD Balance")
  })

  it("uses plain deposit-fee copy for USDT (no bridge jargon)", () => {
    expect(
      receiveStablecoinDepositSubtitle({ asset: "USDT", network: "Tron" }),
    ).toBe("Deposit fees apply and are deducted.")
  })

  it("returns status copy while provisioning", () => {
    expect(
      receiveStablecoinDepositSubtitle({
        asset: "USDT",
        network: "Tron",
        status: "provisioning",
      }),
    ).toBe("Setting up…")
  })
})

describe("receiveStablecoinPaymentNotes", () => {
  it("avoids Bridge wording for USDT", () => {
    const notes = receiveStablecoinPaymentNotes({
      asset: "USDT",
      network: "Tron",
    })
    expect(notes).toContain("Deposit fees apply and are deducted.")
    expect(notes.join(" ").toLowerCase()).not.toContain("bridge")
  })
})

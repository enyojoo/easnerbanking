import { describe, expect, it } from "vitest"
import {
  formatStablecoinDepositSchemeLabel,
  receiveStablecoinDepositSubtitle,
  receiveStablecoinPaymentNotes,
  relayUsdtReceiveRows,
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

  it("mirrors cash deposit copy for USDT", () => {
    expect(
      receiveStablecoinDepositSubtitle({ asset: "USDT", network: "Tron" }),
    ).toBe("Deposit USDT to credit your USD Balance")
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

describe("relayUsdtReceiveRows", () => {
  it("omits USDT when Relay is off", () => {
    expect(relayUsdtReceiveRows({ enabled: false, addresses: [] })).toEqual([])
  })

  it("keeps an active Tron address", () => {
    expect(
      relayUsdtReceiveRows({
        enabled: true,
        addresses: [{ asset: "USDT", network: "Tron", address: "Txyz" }],
      }),
    ).toEqual([{ asset: "USDT", network: "Tron", status: "active", address: "Txyz" }])
  })

  it("shows a provisioning row when Relay is on but the address is missing", () => {
    expect(relayUsdtReceiveRows({ enabled: true, addresses: [] })).toEqual([
      { asset: "USDT", network: "Tron", status: "provisioning" },
    ])
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

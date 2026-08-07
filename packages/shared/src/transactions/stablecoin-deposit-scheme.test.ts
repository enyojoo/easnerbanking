import { describe, expect, it } from "vitest"
import { formatStablecoinDepositSchemeLabel } from "./stablecoin-deposit-scheme"

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

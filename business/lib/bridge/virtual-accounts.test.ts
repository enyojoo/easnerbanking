import { describe, expect, it } from "vitest"
import { bridgeVaSourceCurrency, isBridgeVaLinkedToTurnkeyVault } from "./virtual-accounts"

const vault = {
  vaultAddress: "CZL3uoLy1j6Hye3tnrJQ82yWG3nKwcncQfUmquvHxvfC",
  destCurrency: "usdc" as const,
}

describe("bridgeVaSourceCurrency", () => {
  it("prefers fiat source over destination stablecoin", () => {
    expect(
      bridgeVaSourceCurrency({
        id: "va_1",
        source_deposit_instructions: { currency: "usd" },
        destination: { currency: "usdc" },
      }),
    ).toBe("usd")
  })
})

describe("isBridgeVaLinkedToTurnkeyVault", () => {
  it("requires the exact Solana vault address and dest currency", () => {
    expect(
      isBridgeVaLinkedToTurnkeyVault(
        {
          id: "va_1",
          destination: {
            payment_rail: "solana",
            currency: "usdc",
            address: vault.vaultAddress,
          },
        },
        vault,
      ),
    ).toBe(true)
  })

  it("rejects a Bridge-hosted or other wallet destination", () => {
    expect(
      isBridgeVaLinkedToTurnkeyVault(
        {
          id: "va_1",
          destination: {
            payment_rail: "solana",
            currency: "usdc",
            address: "4xMcBmRGzymurjVJVC1jezipeicpKbgkVyqUE8AWCV44",
          },
        },
        vault,
      ),
    ).toBe(false)
  })
})

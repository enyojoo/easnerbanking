import { describe, expect, it } from "vitest"
import {
  isValidSolanaAddressFormat,
  normalizeSolanaAddress,
  validateWalletAddressForNetwork,
} from "./address-format"

describe("normalizeSolanaAddress", () => {
  it("strips whitespace", () => {
    expect(normalizeSolanaAddress("  Abc  Def  ")).toBe("AbcDef")
  })
})

describe("isValidSolanaAddressFormat", () => {
  it("accepts a typical mainnet pubkey", () => {
    expect(
      isValidSolanaAddressFormat("DCjDB2euJ25aDkRyujR4bu18hz13hQDTucoBmk7AYSbx"),
    ).toBe(true)
  })

  it("rejects EVM addresses", () => {
    expect(
      isValidSolanaAddressFormat("0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"),
    ).toBe(false)
  })

  it("rejects base58 strings with forbidden characters", () => {
    expect(isValidSolanaAddressFormat("0OIl_not_base58_wallet_address_here!!")).toBe(false)
  })
})

describe("validateWalletAddressForNetwork", () => {
  it("requires Solana format when network is Solana", () => {
    expect(
      validateWalletAddressForNetwork(
        "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        "Solana",
      ).isValid,
    ).toBe(false)
    expect(
      validateWalletAddressForNetwork(
        "DCjDB2euJ25aDkRyujR4bu18hz13hQDTucoBmk7AYSbx",
        "Solana",
      ).isValid,
    ).toBe(true)
  })

  it("validates EVM networks", () => {
    expect(
      validateWalletAddressForNetwork(
        "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        "Ethereum",
      ).isValid,
    ).toBe(true)
  })
})

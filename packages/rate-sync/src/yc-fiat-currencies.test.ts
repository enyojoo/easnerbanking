import { describe, expect, it } from "vitest"
import {
  YC_EXCLUDED_CRYPTO_CURRENCIES,
  buildYcCrossPairsFromFiats,
  isYcFiatCurrency,
  isYcStoredRatePair,
} from "./yc-fiat-currencies"

describe("yc-fiat-currencies", () => {
  it("accepts YC fiat locals and rejects stablecoins", () => {
    expect(isYcFiatCurrency("NGN")).toBe(true)
    expect(isYcFiatCurrency("KES")).toBe(true)
    expect(isYcFiatCurrency("XOF")).toBe(true)
    expect(isYcFiatCurrency("USD")).toBe(false)
    expect(isYcFiatCurrency("USDC")).toBe(false)
    for (const code of YC_EXCLUDED_CRYPTO_CURRENCIES) {
      expect(isYcFiatCurrency(code)).toBe(false)
    }
  })

  it("allows stored fiat bridge and cross pairs", () => {
    expect(isYcStoredRatePair("NGN", "USDC")).toBe(true)
    expect(isYcStoredRatePair("USD", "NGN")).toBe(true)
    expect(isYcStoredRatePair("USDC", "KES")).toBe(true)
    expect(isYcStoredRatePair("NGN", "KES")).toBe(true)
    expect(isYcStoredRatePair("ETH", "USDC")).toBe(false)
    expect(isYcStoredRatePair("NGN", "SOL")).toBe(false)
    expect(isYcStoredRatePair("CUSD", "NGN")).toBe(false)
  })

  it("builds all ordered fiat cross pairs", () => {
    const pairs = buildYcCrossPairsFromFiats(["NGN", "KES", "GHS"])
    expect(pairs).toHaveLength(6)
    expect(pairs).toContainEqual({ from_currency: "NGN", to_currency: "KES" })
    expect(pairs).toContainEqual({ from_currency: "KES", to_currency: "NGN" })
  })
})

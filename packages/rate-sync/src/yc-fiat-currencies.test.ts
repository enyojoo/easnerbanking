import { describe, expect, it } from "vitest"
import {
  YC_EXCLUDED_CRYPTO_CURRENCIES,
  buildYcCrossPairsFromFiats,
  isYcAllowlistedFiat,
  isYcFiatCurrency,
  isYcStoredRatePair,
  isYcStoredRatePairForAllowlist,
} from "./yc-fiat-currencies"

describe("yc-fiat-currencies", () => {
  it("accepts YC fiat locals and rejects stablecoins/crypto", () => {
    expect(isYcFiatCurrency("NGN")).toBe(true)
    expect(isYcFiatCurrency("KES")).toBe(true)
    expect(isYcFiatCurrency("XOF")).toBe(true)
    expect(isYcFiatCurrency("USD")).toBe(false)
    expect(isYcFiatCurrency("USDC")).toBe(false)
    expect(isYcFiatCurrency("ADA")).toBe(false)
    expect(isYcFiatCurrency("XRP")).toBe(false)
    expect(isYcFiatCurrency("XLM")).toBe(false)
    for (const code of YC_EXCLUDED_CRYPTO_CURRENCIES) {
      expect(isYcFiatCurrency(code)).toBe(false)
    }
  })

  it("allows only canonical stored pairs", () => {
    expect(isYcStoredRatePair("NGN", "USDC")).toBe(true)
    expect(isYcStoredRatePair("USD", "NGN")).toBe(true)
    expect(isYcStoredRatePair("NGN", "KES")).toBe(true)
    expect(isYcStoredRatePair("USDC", "KES")).toBe(false)
    expect(isYcStoredRatePair("USDC", "NGN")).toBe(false)
    expect(isYcStoredRatePair("ETH", "USDC")).toBe(false)
    expect(isYcStoredRatePair("ADA", "USDC")).toBe(false)
    expect(isYcStoredRatePair("NGN", "SOL")).toBe(false)
    expect(isYcStoredRatePair("CUSD", "NGN")).toBe(false)
    expect(isYcStoredRatePair("USD", "USDC")).toBe(false)
  })

  it("filters by corridor allowlist when provided", () => {
    const allow = new Set(["NGN", "KES"])
    expect(isYcAllowlistedFiat("NGN", allow)).toBe(true)
    expect(isYcAllowlistedFiat("GHS", allow)).toBe(false)
    expect(isYcStoredRatePairForAllowlist("USD", "NGN", allow)).toBe(true)
    expect(isYcStoredRatePairForAllowlist("USD", "GHS", allow)).toBe(false)
    expect(isYcStoredRatePairForAllowlist("NGN", "KES", allow)).toBe(true)
    expect(isYcStoredRatePairForAllowlist("NGN", "GHS", allow)).toBe(false)
    expect(isYcStoredRatePairForAllowlist("USDC", "NGN", allow)).toBe(false)
  })

  it("builds all ordered fiat cross pairs", () => {
    const pairs = buildYcCrossPairsFromFiats(["NGN", "KES", "GHS"])
    expect(pairs).toHaveLength(6)
    expect(pairs).toContainEqual({ from_currency: "NGN", to_currency: "KES" })
    expect(pairs).toContainEqual({ from_currency: "KES", to_currency: "NGN" })
  })
})

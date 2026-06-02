import { describe, expect, it } from "vitest"
import { getCurrencySymbol, getSendAmountFieldSymbol } from "./currency-symbol"

describe("getSendAmountFieldSymbol", () => {
  it("uses fiat symbols for pegged stables in amount fields", () => {
    expect(getSendAmountFieldSymbol("USDT")).toBe("$")
    expect(getSendAmountFieldSymbol("USDC")).toBe("$")
    expect(getSendAmountFieldSymbol("stable")).toBe("$")
    expect(getSendAmountFieldSymbol("EURC")).toBe("€")
    expect(getSendAmountFieldSymbol("eurc")).toBe("€")
  })

  it("falls back to normal currency symbols for fiat", () => {
    expect(getSendAmountFieldSymbol("USD")).toBe("$")
    expect(getSendAmountFieldSymbol("ZAR")).toBe("R")
    expect(getSendAmountFieldSymbol("KES")).toBe("KSh")
  })
})

describe("getCurrencySymbol", () => {
  it("returns ISO tickers when no override exists", () => {
    expect(getCurrencySymbol("USDC")).toBe("USDC")
    expect(getCurrencySymbol("USDT")).toBe("USDT")
  })
})

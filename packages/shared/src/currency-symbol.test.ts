import { describe, expect, it } from "vitest"
import {
  getCurrencySymbol,
  getSendAmountFieldSymbol,
  isWideSendAmountSymbol,
  scaleSendAmountPrefixFontSize,
} from "./currency-symbol"

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
    expect(getSendAmountFieldSymbol("RWF")).toBe("R₣")
  })
})

describe("wide send amount symbols", () => {
  it("treats KSh as wide, R₣ like other two-char symbols", () => {
    expect(isWideSendAmountSymbol("KSh")).toBe(true)
    expect(isWideSendAmountSymbol("R₣")).toBe(false)
    expect(isWideSendAmountSymbol("$")).toBe(false)
    expect(isWideSendAmountSymbol("RF")).toBe(false)
  })

  it("scales down prefix font for wide symbols", () => {
    expect(scaleSendAmountPrefixFontSize(50, "KSh")).toBe(26)
    expect(scaleSendAmountPrefixFontSize(50, "$")).toBe(50)
  })
})

describe("getCurrencySymbol", () => {
  it("returns ISO tickers when no override exists", () => {
    expect(getCurrencySymbol("USDC")).toBe("USDC")
    expect(getCurrencySymbol("USDT")).toBe("USDT")
  })
})

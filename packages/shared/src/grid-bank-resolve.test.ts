import { describe, expect, it } from "vitest"
import {
  gridBankLabelsMatch,
  isStoredBankNameAllowedForOptions,
  resolveGridBankName,
  resolveGridMomoProvider,
} from "./grid-bank-resolve"

const NG_GRID_BANKS = [
  "Kuda Microfinance Bank",
  "GT Bank",
  "Access Bank",
  "Zenith Bank",
  "Fcmb",
  "United Bank For Africa",
]

describe("resolveGridBankName", () => {
  it("maps Noah-style short names via alias + fuzzy match against Grid bank_enum", () => {
    expect(resolveGridBankName("Kuda", NG_GRID_BANKS)).toBe("Kuda Microfinance Bank")
    expect(resolveGridBankName("GTBank", NG_GRID_BANKS)).toBe("GT Bank")
    expect(resolveGridBankName("Guaranty Trust Bank (GTBank)", NG_GRID_BANKS)).toBe("GT Bank")
  })

  it("returns alias when corridor candidates are unavailable", () => {
    expect(resolveGridBankName("Kuda")).toBe("Kuda Microfinance Bank")
    expect(resolveGridBankName("M-PESA")).toBe("M-Pesa")
  })

  it("matches compact bank names across spacing differences", () => {
    expect(gridBankLabelsMatch("GT Bank", "GTBank")).toBe(true)
    expect(resolveGridBankName("GT Bank", ["GTBank", "Access Bank"])).toBe("GTBank")
  })
})

describe("gridBankLabelsMatch", () => {
  it("matches substring institution names", () => {
    expect(gridBankLabelsMatch("Kuda", "Kuda Microfinance Bank")).toBe(true)
    expect(gridBankLabelsMatch("Zenith", "Zenith Bank")).toBe(true)
  })
})

describe("isStoredBankNameAllowedForOptions", () => {
  it("allows Noah bank names when they fuzzy-match Grid corridor options", () => {
    expect(isStoredBankNameAllowedForOptions("Kuda", NG_GRID_BANKS)).toBe(true)
    expect(isStoredBankNameAllowedForOptions("GTBank", NG_GRID_BANKS)).toBe(true)
    expect(isStoredBankNameAllowedForOptions("Unknown Bank XYZ", NG_GRID_BANKS)).toBe(false)
  })
})

describe("resolveGridMomoProvider", () => {
  it("maps stored provider labels to Grid canonical values", () => {
    const options = [
      { value: "M-Pesa", label: "M-Pesa" },
      { value: "Airtel Money", label: "Airtel Money Kenya" },
    ]
    expect(resolveGridMomoProvider("M-PESA", options)).toBe("M-Pesa")
    expect(resolveGridMomoProvider("Airtel", options)).toBe("Airtel Money")
  })
})

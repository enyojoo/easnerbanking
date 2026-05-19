import { describe, expect, it } from "vitest"
import {
  formatVaAccountHolderName,
  formatVaBankAddress,
  formatVaBankName,
  titleCaseBankName,
} from "./format-display-text"

describe("titleCaseBankName", () => {
  it("keeps abbreviation + title-cases Bank", () => {
    expect(titleCaseBankName("SSB BANK")).toBe("SSB Bank")
    expect(titleCaseBankName("SSB Bank")).toBe("SSB Bank")
  })

  it("title-cases regular words", () => {
    expect(titleCaseBankName("BRIDGE BANK")).toBe("Bridge Bank")
    expect(titleCaseBankName("FIRST NATIONAL BANK")).toBe("First National Bank")
  })

  it("preserves multi-letter abbreviations", () => {
    expect(titleCaseBankName("HSBC BANK")).toBe("HSBC Bank")
  })
})

describe("formatVaAccountHolderName", () => {
  it("title-cases holder names", () => {
    expect(formatVaAccountHolderName("SAMUEL ENYOJO ODIBA")).toBe("Samuel Enyojo Odiba")
  })
})

describe("formatVaBankAddress", () => {
  it("title-cases address lines", () => {
    expect(formatVaBankAddress("39 PLOT, APO DUTSE, ABUJA")).toBe("39 Plot, Apo Dutse, Abuja")
  })
})

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
    expect(formatVaAccountHolderName("JANE Q PUBLIC")).toBe("Jane Q Public")
  })
})

describe("formatVaBankAddress", () => {
  it("title-cases address lines", () => {
    expect(formatVaBankAddress("39 PLOT, APO DUTSE, ABUJA")).toBe("39 Plot, Apo Dutse, Abuja")
  })

  it("preserves US state and country abbreviations", () => {
    expect(formatVaBankAddress("123 MAIN ST, PHILADELPHIA, PA 19103, US")).toBe(
      "123 Main St, Philadelphia, PA 19103, US"
    )
    expect(formatVaBankAddress("WILMINGTON, DE, US")).toBe("Wilmington, DE, US")
  })
})

import { describe, expect, it } from "vitest"
import { formatDisplayPersonName } from "./format-display-name"

describe("formatDisplayPersonName", () => {
  it("title-cases ALL CAPS personal names", () => {
    expect(formatDisplayPersonName("JANE Q PUBLIC")).toBe("Jane Q Public")
  })

  it("title-cases merchant / company names", () => {
    expect(formatDisplayPersonName("GREY")).toBe("Grey")
    expect(formatDisplayPersonName("ACME PAYMENTS LLC")).toBe("Acme Payments Llc")
  })

  it("handles empty input", () => {
    expect(formatDisplayPersonName("")).toBe("")
    expect(formatDisplayPersonName(null)).toBe("")
  })

  it("preserves hyphens and apostrophes", () => {
    expect(formatDisplayPersonName("MARY-JANE O'BRIEN")).toBe("Mary-Jane O'Brien")
  })
})

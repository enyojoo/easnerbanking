import { describe, expect, it } from "vitest"
import { formatMoneyDisplay } from "./format-money-display"

describe("formatMoneyDisplay", () => {
  it("uses currency symbols from overrides", () => {
    expect(formatMoneyDisplay(18.5, "ZAR")).toBe("R18.50")
    expect(formatMoneyDisplay(18, "ZAR")).toBe("R18")
    expect(formatMoneyDisplay(6000, "RWF")).toBe("R₣6,000")
  })

  it("hides .00 for whole amounts but keeps cents when present", () => {
    expect(formatMoneyDisplay(50, "USD")).toBe("$50")
    expect(formatMoneyDisplay(50.5, "USD")).toBe("$50.50")
    expect(formatMoneyDisplay(50.5, "EUR")).toBe("€50.50")
  })

  it("omits fraction digits for zero-decimal payout currencies", () => {
    expect(formatMoneyDisplay(5000, "NGN")).toBe("₦5,000")
    expect(formatMoneyDisplay(1500.9, "KES")).toBe("KSh1,501")
  })

  it("respects explicit fraction digit overrides", () => {
    expect(
      formatMoneyDisplay(6000, "RWF", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    ).toBe("R₣6,000.00")
  })
})

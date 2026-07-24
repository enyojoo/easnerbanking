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

  it("keeps exact kobo/cents for NGN/KES (YC pay-in must not round)", () => {
    expect(formatMoneyDisplay(5000, "NGN")).toBe("₦5,000")
    expect(formatMoneyDisplay(3678.96, "NGN")).toBe("₦3,678.96")
    expect(formatMoneyDisplay(1500.9, "KES")).toBe("KSh1,500.90")
  })

  it("uses pegged fiat symbols for stablecoins", () => {
    expect(formatMoneyDisplay(1, "USDC")).toBe("$1")
    expect(formatMoneyDisplay(1.5, "EURC")).toBe("€1.50")
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

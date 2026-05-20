import { describe, expect, it } from "vitest"
import { formatExchangeRate, formatSendRateLabel } from "./format-exchange-rate"

describe("formatExchangeRate", () => {
  it("rounds large rates to 2 decimals with grouping", () => {
    expect(formatExchangeRate(1342.7546)).toBe("1,342.75")
  })

  it("rounds sub-unit rates to a few decimals", () => {
    expect(formatExchangeRate(0.04857)).toBe("0.049")
  })

  it("keeps unity at two decimals", () => {
    expect(formatExchangeRate(1)).toBe("1.00")
  })
})

describe("formatSendRateLabel", () => {
  it("uses symbols not ISO codes", () => {
    expect(formatSendRateLabel("USD", "NGN", 1342.7546)).toBe("$1 = ₦1,342.75")
  })
})

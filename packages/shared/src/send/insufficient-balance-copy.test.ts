import { describe, expect, it } from "vitest"
import {
  customerFacingSendAmountError,
  insufficientSourceBalanceCopy,
  insufficientSourceBalanceDetail,
  isInsufficientBalanceError,
} from "./insufficient-balance-copy"

describe("insufficient balance copy", () => {
  it("uses the source currency, not the receive asset", () => {
    expect(insufficientSourceBalanceCopy("USD")).toBe("Insufficient USD balance")
    expect(insufficientSourceBalanceCopy("eur")).toBe("Insufficient EUR balance")
  })

  it("maps provider tokens and error objects to copy", () => {
    expect(isInsufficientBalanceError("insufficient_balance")).toBe(true)
    expect(customerFacingSendAmountError("insufficient_balance", "USD")).toBe(
      "Insufficient USD balance",
    )
    expect(customerFacingSendAmountError({ error: "insufficient_balance" }, "USD")).toBe(
      "Insufficient USD balance",
    )
    expect(customerFacingSendAmountError("quote_failed", "USD")).toBeNull()
  })

  it("includes shortfall as a sentence, not a code", () => {
    expect(insufficientSourceBalanceDetail("USD", 0.12, "$0.12")).toBe(
      "Insufficient USD balance. You need $0.12 more, or choose another source.",
    )
  })
})

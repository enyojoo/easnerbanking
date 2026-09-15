import { describe, expect, it } from "vitest"
import {
  customerFacingSendAmountError,
  insufficientSourceBalanceCopy,
  insufficientSourceBalanceDetail,
  insufficientSourceBalanceMoveCopy,
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
    expect(
      customerFacingSendAmountError(
        "Yellowcard's single locked send would underpay the recipient by 8.15 NGN.",
        "USD",
      ),
    ).toBe("We couldn't complete this transfer at the amount shown. Try again.")
    expect(customerFacingSendAmountError("YC_SEND_NO_COMPLIANT_QUANTUM", "USD")).toBe(
      "We couldn't complete this transfer at the amount shown. Try a slightly different amount.",
    )
  })

  it("uses send+fees copy without a competing shortfall amount", () => {
    expect(insufficientSourceBalanceDetail()).toBe("Not enough balance for send + fees")
  })

  it("uses move copy without send+fees", () => {
    expect(insufficientSourceBalanceMoveCopy()).toBe("Not enough balance for this move")
  })
})

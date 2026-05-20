import { describe, expect, it } from "vitest"
import {
  buildBankDepositProcessingDescription,
  deriveBankDepositSchemeLabel,
} from "./bank-deposit-scheme"

describe("deriveBankDepositSchemeLabel", () => {
  it("returns ACH for BankAch PaymentMethodType", () => {
    expect(
      deriveBankDepositSchemeLabel({
        metadata: { noah_payment_method_type: "BankAch", fiat_deposit_currency: "USD" },
      }),
    ).toBe("ACH")
  })

  it("returns Wire from FiatPaymentMethod id", () => {
    expect(
      deriveBankDepositSchemeLabel({
        metadata: { fiat_deposit_currency: "USD" },
        payload: {
          FiatPaymentMethod: { ID: "Bank/Wire/USD/043087080/659549996956/customer" },
        },
      }),
    ).toBe("Wire")
  })

  it("defaults EUR to SEPA", () => {
    expect(
      deriveBankDepositSchemeLabel({
        metadata: { fiat_deposit_currency: "EUR" },
      }),
    ).toBe("SEPA")
  })

  it("defaults GBP to Faster Payments", () => {
    expect(
      deriveBankDepositSchemeLabel({
        metadata: { fiat_deposit_currency: "GBP" },
      }),
    ).toBe("Faster Payments")
  })
})

describe("buildBankDepositProcessingDescription", () => {
  it("includes scheme in processing copy", () => {
    expect(buildBankDepositProcessingDescription("Wire")).toBe(
      "We've received your Wire deposit and are confirming it.",
    )
  })
})

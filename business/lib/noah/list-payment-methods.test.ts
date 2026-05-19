import { describe, expect, it } from "vitest"
import { mergePaymentMethodRecord } from "./list-payment-methods"

describe("mergePaymentMethodRecord", () => {
  it("keeps IssuerDetails when the later list omits them", () => {
    const payin = {
      ID: "Bank/Ach/USD/043087080/659/eind",
      DisplayDetails: {
        Type: "FiatPaymentMethodBankDisplay",
        AccountNumber: "659",
        BankCode: "043087080",
      },
      IssuerDetails: {
        Name: "SSB BANK",
        Address: "89-16 JAMAICA AVE, WOODHAVEN, NY",
      },
    }
    const all = {
      ID: "Bank/Ach/USD/043087080/659/eind",
      DisplayDetails: {
        Type: "FiatPaymentMethodBankDisplay",
        AccountNumber: "659",
        BankCode: "043087080",
      },
    }
    const merged = mergePaymentMethodRecord(payin, all)
    expect((merged.IssuerDetails as { Name?: string }).Name).toBe("SSB BANK")
    expect(merged.DisplayDetails).toBeTruthy()
  })
})

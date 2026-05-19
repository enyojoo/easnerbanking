import { describe, expect, it } from "vitest"
import {
  isUsAbaRoutingNumber,
  looksLikeSwiftBic,
  mapNoahBankFieldsToColumns,
  parseNoahPaymentMethodRail,
  selectPreferredUsdPayinPaymentMethod,
} from "./payment-method-map"

describe("parseNoahPaymentMethodRail", () => {
  it("detects ACH from PaymentMethodID", () => {
    expect(
      parseNoahPaymentMethodRail({
        ID: "Bank/Ach/USD/021000021/123456789/eind_test",
        PaymentMethodType: "BankAch",
      }),
    ).toBe("ach")
  })

  it("detects SWIFT from PaymentMethodID", () => {
    expect(
      parseNoahPaymentMethodRail({
        ID: "Bank/Swift/USD/SSBAUS32/659549996956/eind_test",
        PaymentMethodType: "BankSwift",
      }),
    ).toBe("swift")
  })
})

describe("mapNoahBankFieldsToColumns", () => {
  it("maps USD ACH routing to routing_number", () => {
    const cols = mapNoahBankFieldsToColumns("usd", "ach", "659549996956", "021000021")
    expect(cols.routingNumber).toBe("021000021")
    expect(cols.bic).toBeNull()
    expect(cols.accountNumber).toBe("659549996956")
  })

  it("maps USD SWIFT BIC to bic not routing_number", () => {
    const cols = mapNoahBankFieldsToColumns("usd", "swift", "659549996956", "SSBAUS32")
    expect(cols.routingNumber).toBeNull()
    expect(cols.bic).toBe("SSBAUS32")
  })

  it("maps EUR SEPA to iban and bic", () => {
    const cols = mapNoahBankFieldsToColumns(
      "eur",
      "sepa",
      "MT13CFTE28004000000000006235761",
      "CFTEMTM1XXX",
    )
    expect(cols.iban).toBe("MT13CFTE28004000000000006235761")
    expect(cols.bic).toBe("CFTEMTM1XXX")
  })
})

describe("selectPreferredUsdPayinPaymentMethod", () => {
  it("prefers ACH over SWIFT", () => {
    const ach = {
      ID: "Bank/Ach/USD/021000021/659549996956/eind_test",
      Country: "US",
      Capabilities: { PayinTo: true },
    }
    const swift = {
      ID: "Bank/Swift/USD/SSBAUS32/659549996956/eind_test",
      Country: "US",
      Capabilities: { PayinTo: true },
    }
    expect(selectPreferredUsdPayinPaymentMethod([swift, ach])?.ID).toBe(ach.ID)
  })
})

describe("routing vs swift heuristics", () => {
  it("identifies ABA routing", () => {
    expect(isUsAbaRoutingNumber("021000021")).toBe(true)
    expect(isUsAbaRoutingNumber("SSBAUS32")).toBe(false)
  })

  it("identifies SWIFT BIC", () => {
    expect(looksLikeSwiftBic("SSBAUS32")).toBe(true)
    expect(looksLikeSwiftBic("021000021")).toBe(false)
  })
})

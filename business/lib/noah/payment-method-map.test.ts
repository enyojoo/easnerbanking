import { describe, expect, it } from "vitest"
import {
  hasPayinBank,
  hasUsdPayinBankMethods,
  isUsAbaRoutingNumber,
  looksLikeSwiftBic,
  mapNoahBankFieldsToColumns,
  mapPaymentMethodToVirtualAccountDisplay,
  parseCurrencyFromNoahPaymentMethodId,
  parseNoahPaymentMethodRail,
  mergeUsdPayinPaymentMethods,
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

describe("parseCurrencyFromNoahPaymentMethodId", () => {
  it("reads USD from PaymentMethodID when FiatCurrency is missing", () => {
    const pm = {
      ID: "Bank/Ach/USD/043087080/659549996956/eind_test",
      Country: "US",
      Capabilities: { PayinTo: false },
    }
    expect(parseCurrencyFromNoahPaymentMethodId(pm)).toBe("usd")
    expect(hasPayinBank(pm, "US")).toBe(true)
    expect(hasUsdPayinBankMethods([pm])).toBe(true)
  })

  it("maps ACH routing from DisplayDetails", () => {
    const pm = {
      ID: "Bank/Ach/USD/043087080/659549996956/eind_test",
      Country: "US",
      DisplayDetails: {
        Type: "FiatPaymentMethodBankDisplay",
        AccountNumber: "659549996956",
        BankCode: "043087080",
      },
    }
    const display = mapPaymentMethodToVirtualAccountDisplay(pm, "usd")
    expect(display.routingNumber).toBe("043087080")
    expect(selectPreferredUsdPayinPaymentMethod([pm])?.ID).toBe(pm.ID)
  })
})

describe("mergeUsdPayinPaymentMethods", () => {
  const ach = {
    ID: "Bank/Ach/USD/043087080/659549996956/eind_test",
    Country: "US",
    DisplayDetails: {
      Type: "FiatPaymentMethodBankDisplay",
      AccountNumber: "659549996956",
      BankCode: "043087080",
    },
  }
  const swift = {
    ID: "Bank/Swift/USD/SSBAUS32/659549996956/eind_test",
    Country: "US",
    DisplayDetails: {
      Type: "FiatPaymentMethodBankDisplay",
      AccountNumber: "659549996956",
      BankCode: "SSBAUS32",
    },
  }

  it("merges ACH routing and SWIFT bic into one USD snapshot", () => {
    const merged = mergeUsdPayinPaymentMethods([swift, ach])
    expect(merged?.canonicalPmId).toBe(ach.ID)
    expect(merged?.accountNumber).toBe("659549996956")
    expect(merged?.routingNumber).toBe("043087080")
    expect(merged?.bic).toBe("SSBAUS32")
  })

  it("picks bank name/address from any rail when ACH omits IssuerDetails", () => {
    const achOnly = {
      ...ach,
      IssuerDetails: undefined,
    }
    const swiftWithIssuer = {
      ...swift,
      IssuerDetails: {
        Name: "SSB BANK",
        Address: { Street: "89-16 JAMAICA AVE", City: "WOODHAVEN", State: "NY", Country: "US" },
      },
    }
    const merged = mergeUsdPayinPaymentMethods([achOnly, swiftWithIssuer])
    expect(merged?.bankName).toBe("SSB BANK")
    expect(merged?.bankAddress).toContain("JAMAICA AVE")
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

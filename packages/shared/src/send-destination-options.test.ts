import { describe, expect, it } from "vitest"
import { buildCrossBorderPaymentMethods, buildOtherSendCurrencies } from "./send-destination-options"
import type { SendDestinationsResponse } from "./send-destinations"

const catalog: SendDestinationsResponse = {
  catalog_version: "1",
  balance_currencies: [],
  fiat: {
    bank_transfer: [
      {
        id: "1",
        rail: "bank_transfer",
        country_code: "KE",
        country_name: "Kenya",
        currency_code: "KES",
        currency_name: "Kenyan Shilling",
        sort_order: 0,
        providers: null,
      },
    ],
    mobile_money: [
      {
        id: "2",
        rail: "mobile_money",
        country_code: "KE",
        country_name: "Kenya",
        currency_code: "KES",
        currency_name: "Kenyan Shilling",
        sort_order: 0,
        providers: ["M-PESA"],
      },
      {
        id: "3",
        rail: "mobile_money",
        country_code: "GH",
        country_name: "Ghana",
        currency_code: "GHS",
        currency_name: "Ghanaian Cedi",
        sort_order: 0,
        providers: ["MTN"],
      },
    ],
  },
  crypto: [],
}

describe("send-destination-options", () => {
  it("builds cross-border currencies excluding balance-hold fiats", () => {
    const other = buildOtherSendCurrencies(catalog)
    expect(other.map((c) => c.code).sort()).toEqual(["GHS", "KES"])
  })

  it("omits US USD from cross-border catalogs", () => {
    const withUs: SendDestinationsResponse = {
      ...catalog,
      fiat: {
        ...catalog.fiat,
        bank_transfer: [
          ...catalog.fiat.bank_transfer,
          {
            id: "us",
            rail: "bank_transfer",
            country_code: "US",
            country_name: "United States",
            currency_code: "USD",
            currency_name: "US Dollar",
            sort_order: 0,
            providers: null,
          },
        ],
      },
    }
    expect(buildOtherSendCurrencies(withUs).map((c) => c.code)).not.toContain("USD")
    expect(buildCrossBorderPaymentMethods(withUs).USD).toBeUndefined()
  })

  it("builds payment methods per currency from rails", () => {
    const methods = buildCrossBorderPaymentMethods(catalog)
    expect(methods.KES?.map((m) => m.code).sort()).toEqual(["bankTransfer", "mpesa"])
    expect(methods.GHS?.map((m) => m.code)).toContain("mtnMomo")
  })
})

import { describe, expect, it } from "vitest"
import { publicPlatformCatalog, publicPlatformCorridor } from "./payment-methods"

describe("publicPlatformCatalog", () => {
  it("strips partner routing from the first-party catalog", () => {
    const catalog = publicPlatformCatalog({
      catalog_version: "business:1",
      balance_currencies: [{ code: "USD", available: true, active: true }],
      fiat: {
        bank_transfer: [
          {
            id: "us-usd",
            rail: "bank_transfer",
            country_code: "US",
            country_name: "United States",
            currency_code: "USD",
            currency_name: "US Dollar",
            sort_order: 1,
            providers: null,
            provider_routing: [{ provider: "hidden", priority: 1 }],
            noah_sell_available: true,
            fields_schema: { account_number: {} },
          },
        ],
        mobile_money: [
          {
            id: "ke-kes",
            rail: "mobile_money",
            country_code: "KE",
            country_name: "Kenya",
            currency_code: "KES",
            currency_name: "Kenyan Shilling",
            sort_order: 2,
            providers: ["M-Pesa"],
          },
        ],
      },
      crypto: [
        {
          id: "usdc",
          asset_code: "USDC",
          asset_name: "USD Coin",
          networks: ["solana"],
          country_code: null,
          sort_order: 1,
          provider_routing: [{ provider: "hidden", priority: 1 }],
        },
      ],
    })
    expect(catalog).toEqual({
      catalog_version: "business:1",
      currencies: [{ code: "USD", available: true }],
      fiat: {
        bank: [
          {
            id: "us-usd",
            rail: "bank",
            country: "US",
            country_name: "United States",
            currency: "USD",
            currency_name: "US Dollar",
            networks: null,
            fields: { account_number: {} },
          },
        ],
        mobile_money: [
          {
            id: "ke-kes",
            rail: "mobile_money",
            country: "KE",
            country_name: "Kenya",
            currency: "KES",
            currency_name: "Kenyan Shilling",
            networks: ["M-Pesa"],
          },
        ],
      },
      crypto: [{ asset: "USDC", name: "USD Coin", networks: ["solana"] }],
    })
    expect(JSON.stringify(catalog)).not.toMatch(/hidden|noah|grid|yellowcard|bridge/i)
  })
})

describe("publicPlatformCorridor", () => {
  it("maps bank_transfer to bank", () => {
    expect(
      publicPlatformCorridor({
        id: "gb-gbp",
        rail: "bank_transfer",
        country_code: "GB",
        country_name: "United Kingdom",
        currency_code: "GBP",
        currency_name: "Pound",
        sort_order: 1,
        providers: null,
      }).rail,
    ).toBe("bank")
  })
})

import { describe, expect, it } from "vitest"
import { collectGridCorridorTargets } from "../grid-corridor-sync"
import type { GridDiscovery } from "@/lib/grid/types"

describe("collectGridCorridorTargets", () => {
  it("builds bank and momo targets from discoveries", () => {
    const discoveries: GridDiscovery[] = [
      {
        country: "KE",
        currency: "KES",
        bankName: "Equity Bank",
        paymentRails: ["BANK_TRANSFER"],
      },
      {
        country: "KE",
        currency: "KES",
        bankName: "M-Pesa",
        displayName: "M-Pesa",
        paymentRails: ["MOBILE_MONEY"],
      },
    ]

    const targets = collectGridCorridorTargets({
      discoveries,
      exchangeRates: [{ from: "USD", to: "KES", country: "KE" }],
    })

    expect(targets).toEqual(
      expect.arrayContaining([
        { countryCode: "KE", currencyCode: "KES", rail: "bank_transfer" },
        { countryCode: "KE", currencyCode: "KES", rail: "mobile_money" },
      ]),
    )
  })

  it("adds bank_transfer targets from USD exchange rates when discoveries are sparse", () => {
    const targets = collectGridCorridorTargets({
      discoveries: [],
      exchangeRates: [
        { from: "USD", to: "INR", country: "IN" },
        { from: "USD", to: "BRL", country: "BR" },
      ],
    })

    expect(targets).toEqual(
      expect.arrayContaining([
        { countryCode: "IN", currencyCode: "INR", rail: "bank_transfer" },
        { countryCode: "BR", currencyCode: "BRL", rail: "bank_transfer" },
      ]),
    )
  })

  it("includes USD local-currency corridors when country is explicit", () => {
    const targets = collectGridCorridorTargets({
      discoveries: [
        {
          country: "SV",
          currency: "USD",
          bankName: "Banco Agricola",
          paymentRails: ["BANK_TRANSFER"],
        },
        {
          country: "SV",
          currency: "USD",
          bankName: "Tigo Money",
          displayName: "Tigo Money",
          paymentRails: ["MOBILE_MONEY"],
        },
      ],
      exchangeRates: [],
    })

    expect(targets).toEqual(
      expect.arrayContaining([
        { countryCode: "SV", currencyCode: "USD", rail: "bank_transfer" },
        { countryCode: "SV", currencyCode: "USD", rail: "mobile_money" },
      ]),
    )
  })

  it("prefers local payment currency over alternate fiat for the same country+rail", () => {
    const targets = collectGridCorridorTargets({
      discoveries: [
        { country: "DK", currency: "EUR", bankName: "SEPA", paymentRails: ["SEPA"] },
        { country: "DK", currency: "DKK", bankName: "Danske Bank", paymentRails: ["BANK_TRANSFER"] },
      ],
      exchangeRates: [{ from: "USD", to: "EUR", country: "DK" }],
    })

    expect(targets).toEqual([{ countryCode: "DK", currencyCode: "DKK", rail: "bank_transfer" }])
  })
})

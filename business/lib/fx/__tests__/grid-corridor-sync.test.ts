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
      expect.arrayContaining([{ countryCode: "KE", currencyCode: "KES", rail: "mobile_money" }]),
    )
    expect(targets.some((t) => t.countryCode === "KE" && t.rail === "bank_transfer")).toBe(false)
  })

  it("adds mobile_money targets for static Grid momo corridors without discoveries", () => {
    const targets = collectGridCorridorTargets({ discoveries: [], exchangeRates: [] })
    expect(targets).toEqual(
      expect.arrayContaining([
        { countryCode: "UG", currencyCode: "UGX", rail: "mobile_money" },
        { countryCode: "RW", currencyCode: "RWF", rail: "mobile_money" },
      ]),
    )
    expect(targets.some((t) => t.countryCode === "UG" && t.rail === "bank_transfer")).toBe(false)
  })

  it("does not add targets from USD exchange rates without discoveries", () => {
    const targets = collectGridCorridorTargets({
      discoveries: [],
      exchangeRates: [
        { from: "USD", to: "INR", country: "IN" },
        { from: "USD", to: "BRL", country: "BR" },
      ],
    })

    expect(targets.every((t) => t.rail === "mobile_money")).toBe(true)
    expect(targets.some((t) => t.currencyCode === "INR" || t.currencyCode === "BRL")).toBe(false)
  })

  it("excludes NG mobile money corridor target", () => {
    const targets = collectGridCorridorTargets({
      discoveries: [
        {
          country: "NG",
          currency: "NGN",
          bankName: "MTN MoMo",
          displayName: "MTN MoMo",
          paymentRails: ["MOBILE_MONEY"],
        },
      ],
      exchangeRates: [],
    })

    expect(targets.some((t) => t.countryCode === "NG" && t.rail === "mobile_money")).toBe(false)
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

    expect(targets).toEqual(
      expect.arrayContaining([{ countryCode: "DK", currencyCode: "DKK", rail: "bank_transfer" }]),
    )
  })
})

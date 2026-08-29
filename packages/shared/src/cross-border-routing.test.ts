import { describe, expect, it } from "vitest"
import {
  catalogCorridorHasOfficeCrossBorder,
  corridorOfficeCrossBorderEnabled,
  sendAmountOffersThroughLocalCurrency,
} from "./cross-border-routing"

const ngOn = {
  country_code: "NG",
  currency_code: "NGN",
  metadata: { cross_border_enabled: true, cross_border_provider: "yellowcard" },
}
const ngOff = {
  country_code: "NG",
  currency_code: "NGN",
  metadata: { cross_border_enabled: false },
}
const keOn = {
  country_code: "KE",
  currency_code: "KES",
  metadata: { cross_border_enabled: true },
}
const keOff = {
  country_code: "KE",
  currency_code: "KES",
  metadata: { cross_border_enabled: false },
}

describe("corridorOfficeCrossBorderEnabled", () => {
  it("requires an explicit true flag", () => {
    expect(corridorOfficeCrossBorderEnabled({ cross_border_enabled: true })).toBe(true)
    expect(corridorOfficeCrossBorderEnabled({ cross_border_enabled: false })).toBe(false)
    expect(corridorOfficeCrossBorderEnabled({})).toBe(false)
    expect(corridorOfficeCrossBorderEnabled(null)).toBe(false)
  })
})

describe("sendAmountOffersThroughLocalCurrency", () => {
  it("hides TLC when source Cross-border is off even if pay-in exists", () => {
    expect(
      sendAmountOffersThroughLocalCurrency({
        sourceCorridors: [ngOff],
        sourceCountry: "NG",
        sourceCurrency: "NGN",
        destinationCountry: "US",
        destinationCurrency: "USD",
        destinationCorridor: null,
      }),
    ).toBe(false)
  })

  it("shows TLC to US when source Cross-border is on", () => {
    expect(
      sendAmountOffersThroughLocalCurrency({
        sourceCorridors: [ngOn],
        sourceCountry: "NG",
        sourceCurrency: "NGN",
        destinationCountry: "US",
        destinationCurrency: "USD",
        destinationCorridor: null,
      }),
    ).toBe(true)
  })

  it("hides TLC to a local destination when that corridor Cross-border is off", () => {
    expect(
      sendAmountOffersThroughLocalCurrency({
        sourceCorridors: [ngOn],
        sourceCountry: "NG",
        sourceCurrency: "NGN",
        destinationCountry: "KE",
        destinationCurrency: "KES",
        destinationCorridor: keOff,
      }),
    ).toBe(false)
  })

  it("shows TLC to a local destination when both corridors have Cross-border on", () => {
    expect(
      sendAmountOffersThroughLocalCurrency({
        sourceCorridors: [ngOn, keOn],
        sourceCountry: "NG",
        sourceCurrency: "NGN",
        destinationCountry: "KE",
        destinationCurrency: "KES",
        destinationCorridor: keOn,
      }),
    ).toBe(true)
  })

  it("does not treat US USD catalog rows as a Cross-border source", () => {
    expect(
      catalogCorridorHasOfficeCrossBorder(
        [{ country_code: "US", currency_code: "USD", metadata: { cross_border_enabled: true } }],
        "US",
        "USD",
      ),
    ).toBe(false)
  })
})

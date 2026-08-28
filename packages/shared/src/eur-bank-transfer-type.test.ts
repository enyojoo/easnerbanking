import { describe, expect, it } from "vitest"
import {
  coerceEurTransferTypeForProvider,
  eurBankPaymentMethodsForProvider,
  parseEurBankTransferType,
  toGridEurPaymentRail,
} from "./eur-bank-transfer-type"

describe("eurBankPaymentMethodsForProvider", () => {
  it("returns SEPA Instant and SEPA for Grid", () => {
    expect(eurBankPaymentMethodsForProvider("grid").map((m) => m.value)).toEqual([
      "SEPA Instant",
      "SEPA",
    ])
  })

  it("uses SEPA title with Instant / 1–3 days chips", () => {
    expect(eurBankPaymentMethodsForProvider("grid")).toEqual([
      { value: "SEPA Instant", label: "SEPA", speedLabel: "Instant" },
      { value: "SEPA", label: "SEPA", speedLabel: "1–3 days" },
    ])
  })

  it("returns SEPA Instant and SEPA for Noah", () => {
    expect(eurBankPaymentMethodsForProvider("noah").map((m) => m.value)).toEqual([
      "SEPA Instant",
      "SEPA",
    ])
  })

  it("returns empty for Yellowcard", () => {
    expect(eurBankPaymentMethodsForProvider("yellowcard")).toEqual([])
  })
})

describe("parseEurBankTransferType", () => {
  it("parses display and Grid-native aliases", () => {
    expect(parseEurBankTransferType("SEPA Instant")).toBe("SEPA Instant")
    expect(parseEurBankTransferType("SEPA")).toBe("SEPA")
    expect(parseEurBankTransferType("SEPA_INSTANT")).toBe("SEPA Instant")
    expect(parseEurBankTransferType("sepa_instant")).toBe("SEPA Instant")
  })
})

describe("toGridEurPaymentRail", () => {
  it("maps stored values to Grid payment rails", () => {
    expect(toGridEurPaymentRail("SEPA Instant")).toBe("SEPA_INSTANT")
    expect(toGridEurPaymentRail("SEPA")).toBe("SEPA")
    expect(toGridEurPaymentRail(undefined)).toBe("SEPA_INSTANT")
  })
})

describe("coerceEurTransferTypeForProvider", () => {
  it("defaults to SEPA Instant", () => {
    expect(coerceEurTransferTypeForProvider(null, "grid")).toBe("SEPA Instant")
    expect(coerceEurTransferTypeForProvider("", "noah")).toBe("SEPA Instant")
  })

  it("keeps valid selection for Grid and Noah", () => {
    expect(coerceEurTransferTypeForProvider("SEPA", "grid")).toBe("SEPA")
    expect(coerceEurTransferTypeForProvider("SEPA Instant", "noah")).toBe("SEPA Instant")
  })
})

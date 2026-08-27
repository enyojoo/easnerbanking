import { describe, expect, it } from "vitest"
import {
  coerceUsTransferTypeForProvider,
  noahUsPrefersAch,
  parseUsBankTransferType,
  toGridPaymentRail,
  usBankPaymentMethodsForProvider,
  yellowcardOffersDomesticBankPayout,
} from "./us-bank-transfer-type"

describe("usBankPaymentMethodsForProvider", () => {
  it("returns ACH Wire RTP FedNow for Grid", () => {
    expect(usBankPaymentMethodsForProvider("grid").map((m) => m.value)).toEqual([
      "ACH",
      "Wire",
      "RTP",
      "FEDNOW",
    ])
    expect(usBankPaymentMethodsForProvider("grid").map((m) => m.label)).toEqual([
      "ACH",
      "Wire",
      "RTP",
      "FedNow",
    ])
    expect(usBankPaymentMethodsForProvider("grid").map((m) => m.speedLabel)).toEqual([
      "1–3 days",
      "Same day",
      "Instant",
      "Instant",
    ])
  })

  it("returns ACH and Wire for Noah", () => {
    expect(usBankPaymentMethodsForProvider("noah").map((m) => m.value)).toEqual(["ACH", "Wire"])
    expect(usBankPaymentMethodsForProvider("noah").map((m) => m.speedLabel)).toEqual([
      "1–3 days",
      "Same day",
    ])
  })

  it("returns no methods for Yellowcard", () => {
    expect(usBankPaymentMethodsForProvider("yellowcard")).toEqual([])
  })
})

describe("toGridPaymentRail", () => {
  it("maps stored Wire to Grid WIRE", () => {
    expect(toGridPaymentRail("ACH")).toBe("ACH")
    expect(toGridPaymentRail("Wire")).toBe("WIRE")
    expect(toGridPaymentRail("RTP")).toBe("RTP")
    expect(toGridPaymentRail("FEDNOW")).toBe("FEDNOW")
    expect(toGridPaymentRail(null)).toBe("ACH")
  })
})

describe("coerceUsTransferTypeForProvider", () => {
  it("keeps Grid instant rails", () => {
    expect(coerceUsTransferTypeForProvider("RTP", "grid")).toBe("RTP")
    expect(coerceUsTransferTypeForProvider("FEDNOW", "grid")).toBe("FEDNOW")
  })

  it("coerces RTP and FedNow to ACH for Noah", () => {
    expect(coerceUsTransferTypeForProvider("RTP", "noah")).toBe("ACH")
    expect(coerceUsTransferTypeForProvider("FEDNOW", "noah")).toBe("ACH")
    expect(coerceUsTransferTypeForProvider("Wire", "noah")).toBe("Wire")
  })
})

describe("noahUsPrefersAch", () => {
  it("is false only for Wire", () => {
    expect(noahUsPrefersAch("ACH")).toBe(true)
    expect(noahUsPrefersAch("RTP")).toBe(true)
    expect(noahUsPrefersAch("Wire")).toBe(false)
  })
})

describe("parseUsBankTransferType", () => {
  it("accepts Fedwire aliases as Wire", () => {
    expect(parseUsBankTransferType("Fedwire")).toBe("Wire")
    expect(parseUsBankTransferType("WIRE")).toBe("Wire")
    expect(parseUsBankTransferType("FEDNOW")).toBe("FEDNOW")
  })
})

describe("yellowcardOffersDomesticBankPayout", () => {
  it("excludes US USD bank send", () => {
    expect(yellowcardOffersDomesticBankPayout("US", "USD", "bank_transfer")).toBe(false)
    expect(yellowcardOffersDomesticBankPayout("US", "USD")).toBe(false)
  })

  it("keeps other corridors", () => {
    expect(yellowcardOffersDomesticBankPayout("NG", "NGN", "bank_transfer")).toBe(true)
    expect(yellowcardOffersDomesticBankPayout("US", "USD", "mobile_money")).toBe(true)
    expect(yellowcardOffersDomesticBankPayout("KE", "KES")).toBe(true)
  })

  it("Office US bank send lists Grid and Noah, not Yellowcard", () => {
    const support = { noah: true, yellowcard: true, grid: true }
    const options = (["noah", "yellowcard", "grid"] as const).filter((id) => {
      if (id === "yellowcard") {
        return support.yellowcard && yellowcardOffersDomesticBankPayout("US", "USD", "bank_transfer")
      }
      return support[id]
    })
    expect(options).toEqual(["noah", "grid"])
  })
})

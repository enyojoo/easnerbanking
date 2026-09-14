import { describe, expect, it } from "vitest"
import {
  bridgeOffersBankPayIn,
  bridgeOffersBankPayout,
  settlementAssetForPayoutProvider,
} from "./bridge-corridors"

describe("bridgeOffersBankPayout", () => {
  it("covers USD EUR GBP SPEI Pix COP bank rails and not momo", () => {
    expect(bridgeOffersBankPayout("US", "USD")).toBe(true)
    expect(bridgeOffersBankPayout("DE", "EUR")).toBe(true)
    expect(bridgeOffersBankPayout("GB", "GBP")).toBe(true)
    expect(bridgeOffersBankPayout("MX", "MXN")).toBe(true)
    expect(bridgeOffersBankPayout("BR", "BRL")).toBe(true)
    expect(bridgeOffersBankPayout("CO", "COP")).toBe(true)
    expect(bridgeOffersBankPayout("NG", "NGN")).toBe(false)
    expect(bridgeOffersBankPayout("KE", "KES", "mobile_money")).toBe(false)
    expect(bridgeOffersBankPayout("US", "USD", "mobile_money")).toBe(false)
  })
})

describe("bridgeOffersBankPayIn", () => {
  it("is USD and SEPA EUR only", () => {
    expect(bridgeOffersBankPayIn("US", "USD")).toBe(true)
    expect(bridgeOffersBankPayIn("FR", "EUR")).toBe(true)
    expect(bridgeOffersBankPayIn("GB", "GBP")).toBe(false)
    expect(bridgeOffersBankPayIn("MX", "MXN")).toBe(false)
    expect(bridgeOffersBankPayIn("US", "USD", "mobile_money")).toBe(false)
  })
})

describe("settlementAssetForPayoutProvider", () => {
  it("uses EURC for Bridge EUR and USDC otherwise", () => {
    expect(settlementAssetForPayoutProvider("bridge", "EUR")).toBe("EURC")
    expect(settlementAssetForPayoutProvider("bridge", "USD")).toBe("USDC")
    expect(settlementAssetForPayoutProvider("grid", "EUR")).toBe("USDC")
    expect(settlementAssetForPayoutProvider("noah", "USD")).toBe("USDC")
  })
})

import { describe, expect, it } from "vitest"
import {
  BUSINESS_VERIFICATION_PRODUCTS,
  CONSUMER_VERIFICATION_PRODUCTS,
  USD_VERIFICATION_REQUIRED_COPY,
  verificationTierLabel,
} from "./compliance-verification-products"

describe("verification product catalog", () => {
  it("shows business USD, live EUR, cards, and online payments without numbered tiers", () => {
    expect(BUSINESS_VERIFICATION_PRODUCTS.map((p) => p.id)).toEqual([
      "global_banking",
      "eur",
      "cards",
      "online_payments",
    ])

    const usd = BUSINESS_VERIFICATION_PRODUCTS[0]
    expect(usd?.title).toBe("USD accounts")
    expect(usd?.availability).toBe("live")
    expect(usd?.ladderTier).toBeUndefined()

    const europe = BUSINESS_VERIFICATION_PRODUCTS.find((p) => p.id === "eur")
    expect(europe?.title).toBe("EUR accounts")
    expect(europe?.availability).toBe("live")
    expect(europe?.footnote).toBe(USD_VERIFICATION_REQUIRED_COPY)

    const cards = BUSINESS_VERIFICATION_PRODUCTS.find((p) => p.id === "cards")
    expect(cards?.availability).toBe("coming_later")
  })

  it("does not put online payments on the mobile catalog", () => {
    const online = BUSINESS_VERIFICATION_PRODUCTS.find((p) => p.id === "online_payments")
    expect(online?.ladderTier).toBeUndefined()
    expect(CONSUMER_VERIFICATION_PRODUCTS.some((p) => p.id === "online_payments")).toBe(false)
  })

  it("uses a single bank-accounts card on mobile", () => {
    expect(CONSUMER_VERIFICATION_PRODUCTS.map((p) => p.id)).toEqual(["global_banking", "cards"])
    expect(CONSUMER_VERIFICATION_PRODUCTS[0]?.title).toBe("Bank accounts")
    expect(verificationTierLabel(1)).toBeNull()
    expect(USD_VERIFICATION_REQUIRED_COPY).toMatch(/USD/)
  })
})

import { describe, expect, it } from "vitest"
import {
  BUSINESS_VERIFICATION_PRODUCTS,
  CONSUMER_VERIFICATION_PRODUCTS,
  USD_VERIFICATION_REQUIRED_COPY,
  verificationTierLabel,
} from "./compliance-verification-products"

describe("verification product ladder", () => {
  it("keeps USD live as tier 1 and EUR/GBP plus cards as later steps", () => {
    const ids = BUSINESS_VERIFICATION_PRODUCTS.map((p) => p.id)
    expect(ids).toEqual(["global_banking", "eur_gbp", "cards", "online_payments"])

    const usd = BUSINESS_VERIFICATION_PRODUCTS[0]
    expect(usd?.ladderTier).toBe(1)
    expect(usd?.availability).toBe("live")
    expect(usd?.title).toBe("USD accounts")

    const europe = BUSINESS_VERIFICATION_PRODUCTS.find((p) => p.id === "eur_gbp")
    expect(europe?.ladderTier).toBe(2)
    expect(europe?.availability).toBe("coming_later")

    const cards = BUSINESS_VERIFICATION_PRODUCTS.find((p) => p.id === "cards")
    expect(cards?.ladderTier).toBe(3)
    expect(cards?.availability).toBe("coming_later")
  })

  it("does not put online payments or express on the numbered banking ladder", () => {
    const online = BUSINESS_VERIFICATION_PRODUCTS.find((p) => p.id === "online_payments")
    expect(online?.ladderTier).toBeUndefined()
    expect(CONSUMER_VERIFICATION_PRODUCTS.some((p) => p.id === "online_payments")).toBe(false)
  })

  it("uses the same USD and EUR/GBP products on mobile", () => {
    expect(CONSUMER_VERIFICATION_PRODUCTS.map((p) => p.id)).toEqual([
      "global_banking",
      "eur_gbp",
      "cards",
    ])
    expect(verificationTierLabel(1)).toBe("Tier 1")
    expect(USD_VERIFICATION_REQUIRED_COPY).toMatch(/USD/)
  })
})

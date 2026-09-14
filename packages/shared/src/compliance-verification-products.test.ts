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
    expect(usd?.title).toBe("Global banking")
    expect(usd?.description).toBe("Get a dollar account, and send to more countries.")
    expect(usd?.availability).toBe("live")
    expect(usd?.ladderTier).toBeUndefined()

    const europe = BUSINESS_VERIFICATION_PRODUCTS.find((p) => p.id === "eur")
    expect(europe?.title).toBe("More accounts")
    expect(europe?.description).toBe("Add euro accounts, and more ways to receive money.")
    expect(europe?.availability).toBe("live")
    expect(europe?.footnote).toBeUndefined()

    const cards = BUSINESS_VERIFICATION_PRODUCTS.find((p) => p.id === "cards")
    expect(cards?.description).toBe("Spend from your balance, in store or online.")
    expect(cards?.availability).toBe("coming_later")

    const online = BUSINESS_VERIFICATION_PRODUCTS.find((p) => p.id === "online_payments")
    expect(online?.description).toBe("Get paid online by card, mobile wallet, or ACH.")
  })

  it("does not put online payments on the mobile catalog", () => {
    const online = BUSINESS_VERIFICATION_PRODUCTS.find((p) => p.id === "online_payments")
    expect(online?.ladderTier).toBeUndefined()
    expect(CONSUMER_VERIFICATION_PRODUCTS.some((p) => p.id === "online_payments")).toBe(false)
  })

  it("uses a single Global banking card on mobile", () => {
    expect(CONSUMER_VERIFICATION_PRODUCTS.map((p) => p.id)).toEqual(["global_banking", "cards"])
    expect(CONSUMER_VERIFICATION_PRODUCTS[0]?.title).toBe("Global banking")
    expect(CONSUMER_VERIFICATION_PRODUCTS[0]?.description).toBe(
      "Get USD and EUR accounts to receive money.",
    )
    expect(CONSUMER_VERIFICATION_PRODUCTS[1]?.description).toBe(
      "Spend from your balance, in store or online.",
    )
    expect(verificationTierLabel(1)).toBeNull()
    expect(USD_VERIFICATION_REQUIRED_COPY).toMatch(/US banking/)
  })
})

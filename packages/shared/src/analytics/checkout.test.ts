import { describe, expect, it } from "vitest"
import { checkoutAnalyticsProperties, checkoutChannelFromSource } from "./checkout"

describe("checkout analytics helpers", () => {
  it("maps known checkout sources to channels", () => {
    expect(checkoutChannelFromSource("embed")).toBe("embed")
    expect(checkoutChannelFromSource("payment_link")).toBe("payment_link")
    expect(checkoutChannelFromSource("invoice")).toBe("invoice")
    expect(checkoutChannelFromSource("unknown")).toBeNull()
  })

  it("builds checkout analytics properties", () => {
    expect(
      checkoutAnalyticsProperties({
        channel: "payment_link",
        businessId: "biz_1",
        settlementId: "set_1",
        currency: "USD",
        amountCents: 1200,
        paymentLinkId: "pl_1",
        livemode: true,
        rail: "card_bank",
      }),
    ).toEqual({
      channel: "payment_link",
      easner_business_id: "biz_1",
      settlement_id: "set_1",
      currency: "USD",
      amount_cents: 1200,
      payment_link_id: "pl_1",
      livemode: true,
      rail: "card_bank",
    })
  })
})

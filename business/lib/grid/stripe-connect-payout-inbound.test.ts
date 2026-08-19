import { describe, expect, it } from "vitest"
import { classifyGridPayoutInbound, isStripeConnectPayoutInbound } from "./stripe-connect-payout-inbound"

describe("classifyGridPayoutInbound", () => {
  it("treats EASNER ACH as Connect", () => {
    const data = {
      source: {
        accountHolderName: "EASNER",
        bankIdentifier: "091000019",
        paymentRail: "ACH",
      },
    }
    expect(classifyGridPayoutInbound(data)).toBe("connect")
    expect(isStripeConnectPayoutInbound(data)).toBe(true)
  })

  it("treats Bridge Building as a Dashboard payout", () => {
    const data = {
      source: {
        accountHolderName: "Bridge Building",
        bankIdentifier: "101019644",
        paymentRail: "ACH",
      },
    }
    expect(classifyGridPayoutInbound(data)).toBe("dashboard")
    expect(isStripeConnectPayoutInbound(data)).toBe(false)
  })

  it("does not treat customer ACH as Connect even when nets could pack", () => {
    expect(
      classifyGridPayoutInbound({
        source: { accountHolderName: "ACME CORP", bankIdentifier: "021000021" },
      }),
    ).toBe("other")
  })

  it("reads nested webhook data", () => {
    expect(
      classifyGridPayoutInbound({
        type: "INCOMING_PAYMENT.COMPLETED",
        data: { source: { accountHolderName: "EASNER" } },
      }),
    ).toBe("connect")
  })
})

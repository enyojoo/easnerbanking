import { describe, expect, it } from "vitest"
import { classifyGridOutgoingPayoutWebhook } from "./webhook-status"

describe("classifyGridOutgoingPayoutWebhook", () => {
  it("treats REFUND_COMPLETED as failure even though the type contains COMPLETED", () => {
    expect(
      classifyGridOutgoingPayoutWebhook({
        eventType: "OUTGOING_PAYMENT.REFUND_COMPLETED",
        status: "FAILED",
      }),
    ).toBe("failed")
  })

  it("treats REFUND_PENDING as failure", () => {
    expect(
      classifyGridOutgoingPayoutWebhook({
        eventType: "OUTGOING_PAYMENT.REFUND_PENDING",
        status: "FAILED",
      }),
    ).toBe("failed")
  })

  it("marks OUTGOING_PAYMENT.FAILED as failed", () => {
    expect(
      classifyGridOutgoingPayoutWebhook({
        eventType: "OUTGOING_PAYMENT.FAILED",
        status: "FAILED",
      }),
    ).toBe("failed")
  })

  it("marks a true payout completion as settled", () => {
    expect(
      classifyGridOutgoingPayoutWebhook({
        eventType: "OUTGOING_PAYMENT.COMPLETED",
        status: "COMPLETED",
      }),
    ).toBe("settled")
  })

  it("keeps PENDING in flight", () => {
    expect(
      classifyGridOutgoingPayoutWebhook({
        eventType: "OUTGOING_PAYMENT.PENDING",
        status: "PENDING",
      }),
    ).toBe("pending")
  })

  it("does not settle on funding INCOMING_PAYMENT.COMPLETED", () => {
    expect(
      classifyGridOutgoingPayoutWebhook({
        eventType: "INCOMING_PAYMENT.COMPLETED",
        status: "COMPLETED",
      }),
    ).toBe("pending")
  })

  it("still treats a bare COMPLETED status as settled for receipt checks", () => {
    expect(classifyGridOutgoingPayoutWebhook({ status: "COMPLETED" })).toBe("settled")
  })
})

import { describe, expect, it } from "vitest"
import {
  classifyYellowcardWebhookEvent,
  yellowcardWebhookEventId,
} from "@/lib/yellowcard/webhook-event-id"

describe("yellowcardWebhookEventId", () => {
  it("builds stable id from event + id + status + time", () => {
    const id = yellowcardWebhookEventId({
      event: "SEND.COMPLETE",
      id: "tx-1",
      status: "complete",
      executedAt: "2026-07-15T12:00:00.000Z",
    })
    expect(id).toBe("yellowcard:SEND.COMPLETE:tx-1:complete:2026-07-15T12:00:00.000Z")
  })

  it("falls back to sequenceId", () => {
    const id = yellowcardWebhookEventId({
      event: "RECEIVE.COMPLETE",
      sequenceId: "seq-9",
    })
    expect(id).toContain("seq-9")
  })
})

describe("classifyYellowcardWebhookEvent", () => {
  it("classifies v2 receive/send", () => {
    expect(classifyYellowcardWebhookEvent("RECEIVE.COMPLETE").kind).toBe("receive")
    expect(classifyYellowcardWebhookEvent("SEND.FAILED").isTerminalFailure).toBe(true)
    expect(classifyYellowcardWebhookEvent("SEND.COMPLETE").isTerminalSuccess).toBe(true)
  })

  it("flags crypto settlement complete", () => {
    expect(
      classifyYellowcardWebhookEvent("CRYPTO_SEND.COMPLETE").isCryptoSettlementComplete,
    ).toBe(true)
    expect(
      classifyYellowcardWebhookEvent("RECEIVE.SETTLEMENT_COMPLETE").isCryptoSettlementComplete,
    ).toBe(true)
  })

  it("tolerates legacy collection/payment", () => {
    expect(classifyYellowcardWebhookEvent("COLLECTION.COMPLETE").kind).toBe("legacy_collection")
    expect(classifyYellowcardWebhookEvent("PAYMENT.FAILED").kind).toBe("legacy_payment")
  })
})

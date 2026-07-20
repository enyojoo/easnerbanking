import { describe, expect, it } from "vitest"
import {
  classifyYellowcardWebhookEvent,
  isYcReceivePrePaymentEvent,
  shouldYcReceiveWebhookAdvanceProcessing,
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

describe("isYcReceivePrePaymentEvent", () => {
  it("flags YC order-state events before user payment", () => {
    expect(isYcReceivePrePaymentEvent("RECEIVE.PENDING")).toBe(true)
    expect(isYcReceivePrePaymentEvent("RECEIVE.PENDING_APPROVAL")).toBe(true)
    expect(isYcReceivePrePaymentEvent("RECEIVE.PROCESSING")).toBe(false)
    expect(isYcReceivePrePaymentEvent("RECEIVE.COMPLETE")).toBe(false)
  })
})

describe("shouldYcReceiveWebhookAdvanceProcessing", () => {
  it("requires attestation and ignores pre-payment events", () => {
    expect(
      shouldYcReceiveWebhookAdvanceProcessing({
        eventType: "RECEIVE.PENDING",
        paymentAttestedAt: "2026-07-21T02:33:00.000Z",
      }),
    ).toBe(false)
    expect(
      shouldYcReceiveWebhookAdvanceProcessing({
        eventType: "RECEIVE.PROCESSING",
        paymentAttestedAt: null,
      }),
    ).toBe(false)
  })

  it("advances after attestation on meaningful receive events", () => {
    expect(
      shouldYcReceiveWebhookAdvanceProcessing({
        eventType: "RECEIVE.PROCESSING",
        paymentAttestedAt: "2026-07-21T02:33:00.000Z",
        webhookOccurredAt: "2026-07-21T02:33:05.000Z",
      }),
    ).toBe(true)
  })

  it("ignores webhooks timestamped before attestation", () => {
    expect(
      shouldYcReceiveWebhookAdvanceProcessing({
        eventType: "RECEIVE.PROCESSING",
        paymentAttestedAt: "2026-07-21T02:33:00.000Z",
        webhookOccurredAt: "2026-07-21T02:32:54.000Z",
      }),
    ).toBe(false)
  })
})

/**
 * Unit tests for Yellowcard status poll helpers.
 */
import { describe, expect, it } from "vitest"
import {
  buildYellowcardPollWebhookEnvelope,
  isYcPollTerminalEnvelope,
  isYcPollTerminalStatus,
} from "./yc-transaction-poll"

describe("yc-transaction-poll", () => {
  it("maps send complete status to SEND.COMPLETE envelope", () => {
    const envelope = buildYellowcardPollWebhookEnvelope("send", {
      sequenceId: "yc_quote_1",
      status: "complete",
      updatedAt: "2026-01-01T00:00:00Z",
    })
    expect(envelope.event).toBe("SEND.COMPLETE")
    expect(envelope.sequenceId).toBe("yc_quote_1")
    expect(isYcPollTerminalEnvelope(envelope)).toBe(true)
  })

  it("maps receive failed status to RECEIVE.FAILED envelope", () => {
    const envelope = buildYellowcardPollWebhookEnvelope("receive", {
      sequenceId: "yc_fb_1",
      status: "failed",
    })
    expect(envelope.event).toBe("RECEIVE.FAILED")
    expect(isYcPollTerminalStatus("failed")).toBe(true)
    expect(isYcPollTerminalEnvelope(envelope)).toBe(true)
  })

  it("maps receive expired status to RECEIVE.FAILED envelope", () => {
    const envelope = buildYellowcardPollWebhookEnvelope("receive", {
      sequenceId: "yc_fb_1",
      status: "expired",
    })
    expect(envelope.event).toBe("RECEIVE.FAILED")
    expect(isYcPollTerminalStatus("expired")).toBe(true)
    expect(isYcPollTerminalEnvelope(envelope)).toBe(true)
  })

  it("treats processing as non-terminal", () => {
    expect(isYcPollTerminalStatus("processing")).toBe(false)
    const envelope = buildYellowcardPollWebhookEnvelope("send", {
      sequenceId: "yc_quote_2",
      status: "processing",
    })
    expect(isYcPollTerminalEnvelope(envelope)).toBe(false)
  })

  it("maps receive settlement_complete to RECEIVE.SETTLEMENT_COMPLETE", () => {
    expect(isYcPollTerminalStatus("settlement_complete")).toBe(true)
    const envelope = buildYellowcardPollWebhookEnvelope("receive", {
      sequenceId: "yc_fb_1",
      status: "settlement_complete",
      settlementInfo: { cryptoAmount: 3.09, txHash: "sig123" },
      updatedAt: "2026-07-24T11:03:09.723Z",
    })
    expect(envelope.event).toBe("RECEIVE.SETTLEMENT_COMPLETE")
    expect(isYcPollTerminalEnvelope(envelope)).toBe(true)
  })
})

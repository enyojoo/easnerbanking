/**
 * Unit tests for Yellowcard webhook event routing helpers + classification.
 */
import { describe, expect, it } from "vitest"
import { classifyYellowcardWebhookEvent } from "./webhook-event-id"

describe("classifyYellowcardWebhookEvent", () => {
  it("classifies receive complete + crypto settlement", () => {
    const c = classifyYellowcardWebhookEvent("RECEIVE.SETTLEMENT_COMPLETE")
    expect(c.kind).toBe("receive")
    expect(c.isCryptoSettlementComplete).toBe(true)
  })

  it("classifies send complete and failed", () => {
    expect(classifyYellowcardWebhookEvent("SEND.COMPLETE").isTerminalSuccess).toBe(true)
    expect(classifyYellowcardWebhookEvent("SEND.FAILED").isTerminalFailure).toBe(true)
  })
})

describe("isYcBalancePayoutQuote heuristics", () => {
  function isYcBalancePayoutQuote(input: {
    payoutProvider?: string | null
    formSessionId?: string | null
    ycSequenceId?: string | null
    ycWalletAddress?: string | null
  }): boolean {
    if (String(input.payoutProvider || "").toLowerCase() === "yellowcard") return true
    const seq = String(input.ycSequenceId || "").trim()
    if (seq.startsWith("yc_quote_")) return true
    const fs = String(input.formSessionId || "").trim()
    if (fs.startsWith("yc_quote_")) return true
    if (String(input.ycWalletAddress || "").trim()) return true
    return false
  }

  it("detects explicit provider and yc_quote sequence", () => {
    expect(isYcBalancePayoutQuote({ payoutProvider: "yellowcard" })).toBe(true)
    expect(isYcBalancePayoutQuote({ ycSequenceId: "yc_quote_abc" })).toBe(true)
    expect(isYcBalancePayoutQuote({ formSessionId: "yc_quote_xyz" })).toBe(true)
    expect(isYcBalancePayoutQuote({ ycWalletAddress: "So111" })).toBe(true)
    expect(isYcBalancePayoutQuote({ formSessionId: "noah-session-1" })).toBe(false)
  })
})

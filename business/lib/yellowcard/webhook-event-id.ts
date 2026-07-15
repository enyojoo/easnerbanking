/**
 * Stable dedupe key for Yellowcard webhook deliveries into `event_inbox`.
 */
export function yellowcardWebhookEventId(payload: Record<string, unknown>): string {
  const event = String(payload.event ?? payload.Event ?? payload.status ?? "unknown")
  const id = String(payload.id ?? payload.sequenceId ?? payload.sequence_id ?? "")
  const executedAt = String(payload.executedAt ?? payload.executed_at ?? "")
  const status = String(payload.status ?? "")
  const parts = ["yellowcard", event, id || "noid", status || "nostatus", executedAt || "notime"]
  return parts.join(":").slice(0, 500)
}

export function yellowcardWebhookEventType(payload: Record<string, unknown>): string {
  return String(payload.event ?? payload.Event ?? payload.status ?? "unknown")
}

/** Normalize v2 + legacy event names into receive/send/settlement buckets. */
export function classifyYellowcardWebhookEvent(eventType: string): {
  kind: "receive" | "send" | "settlement" | "convert" | "legacy_collection" | "legacy_payment" | "other"
  isTerminalSuccess: boolean
  isTerminalFailure: boolean
  isCryptoSettlementComplete: boolean
} {
  const e = eventType.trim().toUpperCase()

  const isTerminalSuccess =
    e.endsWith(".COMPLETE") ||
    e.endsWith(".COMPLETED") ||
    e.includes("SETTLEMENT_COMPLETE") ||
    e === "RECEIVE.COMPLETE" ||
    e === "SEND.COMPLETE"

  const isTerminalFailure =
    e.endsWith(".FAILED") || e.endsWith(".FAIL") || e.includes("FAILED")

  const isCryptoSettlementComplete =
    (e.includes("CRYPTO_SEND") && (e.includes("COMPLETE") || e.includes("SUCCESS"))) ||
    (e.includes("CONVERT") && (e.includes("COMPLETE") || e.includes("SUCCESS"))) ||
    e === "RECEIVE.SETTLEMENT_COMPLETE" ||
    e.includes("SETTLEMENT_COMPLETE")

  if (e.startsWith("RECEIVE.") || e.includes("RECEIVE")) {
    return { kind: "receive", isTerminalSuccess, isTerminalFailure, isCryptoSettlementComplete }
  }
  if (e.startsWith("SEND.") || (e.includes("SEND") && !e.includes("CRYPTO_SEND"))) {
    return { kind: "send", isTerminalSuccess, isTerminalFailure, isCryptoSettlementComplete }
  }
  if (e.startsWith("CRYPTO_SEND.") || e.includes("CRYPTO_SEND")) {
    return { kind: "settlement", isTerminalSuccess, isTerminalFailure, isCryptoSettlementComplete }
  }
  if (e.startsWith("CONVERT.") || e.includes("CONVERT")) {
    return { kind: "convert", isTerminalSuccess, isTerminalFailure, isCryptoSettlementComplete }
  }
  if (e.startsWith("COLLECTION.")) {
    return {
      kind: "legacy_collection",
      isTerminalSuccess,
      isTerminalFailure,
      isCryptoSettlementComplete,
    }
  }
  if (e.startsWith("PAYMENT.")) {
    return {
      kind: "legacy_payment",
      isTerminalSuccess,
      isTerminalFailure,
      isCryptoSettlementComplete,
    }
  }
  return { kind: "other", isTerminalSuccess, isTerminalFailure, isCryptoSettlementComplete }
}

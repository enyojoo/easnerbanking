/**
 * REFUND_COMPLETED includes "COMPLETED" — treat refunds as failure, never settled.
 */
export function classifyGridOutgoingPayoutWebhook(input: {
  eventType?: string | null
  status?: string | null
}): "settled" | "failed" | "pending" {
  const type = String(input.eventType ?? "").trim().toUpperCase()
  const status = String(input.status ?? "").trim().toUpperCase()

  if (type.includes("REFUND") || status.includes("REFUND")) return "failed"
  if (
    type.includes("OUTGOING_PAYMENT.FAILED") ||
    status === "FAILED" ||
    status.includes("FAILED") ||
    status.includes("EXPIRED") ||
    status.includes("CANCELLED") ||
    status.includes("CANCELED")
  ) {
    return "failed"
  }
  if (type.includes("OUTGOING_PAYMENT.COMPLETED") || status === "COMPLETED") {
    return "settled"
  }
  return "pending"
}

export function isSuccessfulGridTransactionStatus(status: string | null | undefined): boolean {
  const classified = classifyGridOutgoingPayoutWebhook({ status, eventType: "" })
  return classified === "settled"
}

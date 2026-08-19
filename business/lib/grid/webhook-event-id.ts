/** Stable dedupe key for Grid webhook deliveries into `event_inbox`. */
export function gridWebhookEventType(payload: Record<string, unknown>): string {
  return String(payload.eventType ?? payload.type ?? "unknown").trim()
}

function gridWebhookData(payload: Record<string, unknown>): Record<string, unknown> | undefined {
  const data = payload.data
  return data && typeof data === "object" ? (data as Record<string, unknown>) : undefined
}

/** Grid sends transaction id on `data.id` (`Transaction:…`); legacy shapes may use `transactionId`. */
export function gridWebhookTransactionId(
  data: Record<string, unknown> | undefined,
): string {
  if (!data) return ""
  const id = String(data.id ?? "").trim()
  if (id.startsWith("Transaction:")) return id
  const direct = String(data.transactionId ?? data.transaction_id ?? "").trim()
  if (direct) return direct
  return id
}

export function gridWebhookQuoteId(data: Record<string, unknown> | undefined): string {
  if (!data) return ""
  return String(data.quoteId ?? data.quote_id ?? "").trim()
}

/** Grid KYB webhooks put the customer on `data.id` (`Customer:…`); legacy shapes may use `customerId`. */
export function gridWebhookCustomerId(data: Record<string, unknown> | undefined): string {
  if (!data) return ""
  const fromField = String(data.customerId ?? data.customer_id ?? "").trim()
  if (fromField.startsWith("Customer:")) return fromField
  const id = String(data.id ?? "").trim()
  if (id.startsWith("Customer:")) return id
  return fromField || id
}

export function gridWebhookDestinationAccountId(data: Record<string, unknown> | undefined): string {
  if (!data) return ""
  const dest = data.destination
  if (dest && typeof dest === "object") {
    const fromDest = String((dest as Record<string, unknown>).accountId ?? "").trim()
    if (fromDest) return fromDest
  }
  for (const key of ["destinationAccountId", "internalAccountId", "accountId"] as const) {
    const value = String(data[key] ?? "").trim()
    if (value.startsWith("InternalAccount:")) return value
  }
  return ""
}

export function gridWebhookEventId(payload: Record<string, unknown>): string {
  const eventType = gridWebhookEventType(payload)
  const topId = String(payload.id ?? payload.eventId ?? "").trim()
  if (topId) return `grid:${eventType}:${topId}`.slice(0, 500)

  const data = gridWebhookData(payload)
  const txId = gridWebhookTransactionId(data)
  const quoteId = gridWebhookQuoteId(data)
  const createdAt = String(payload.createdAt ?? data?.updatedAt ?? data?.createdAt ?? "").trim()
  const status = String(data?.status ?? "").trim()

  const parts = [
    "grid",
    eventType,
    txId || quoteId || "noentity",
    status || "nostatus",
    createdAt || "notime",
  ]
  return parts.join(":").slice(0, 500)
}

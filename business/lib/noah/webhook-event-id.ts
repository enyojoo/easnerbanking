/** Stable `event_inbox.event_id` for Noah webhook payloads (dedupe + replay). */
export function noahWebhookEventId(payload: unknown): string {
  const p = (payload || {}) as Record<string, unknown>
  const eventType = String(p.EventType ?? "").trim()
  const eventVersion = String(p.EventVersion ?? "").trim()
  const data = p.Data as Record<string, unknown> | undefined
  const entityId = data?.ID != null ? String(data.ID).trim() : ""
  const customerId = data?.CustomerID != null ? String(data.CustomerID).trim() : ""

  if (entityId) {
    return `noah:${eventType}:${entityId}:${eventVersion || "v0"}`
  }
  if (customerId) {
    return `noah:${eventType}:${customerId}:${eventVersion || "v0"}`
  }
  return `noah:${eventType}:${eventVersion || "v0"}:na`
}

import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { recordEventInbox, markEventInboxProcessed } from "@/lib/webhooks/event-inbox"
import { applyBridgeWebhookSideEffects } from "./webhook-processor"

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function formatWebhookProcessingError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function bridgeWebhookEventId(payload: unknown): string {
  const p = asRecord(payload)
  const data = asRecord(p.event_object ?? p.data)
  return String(p.event_id ?? p.id ?? data.deposit_id ?? data.id ?? `${Date.now()}`).trim()
}

export function bridgeWebhookEventType(payload: unknown): string {
  const p = asRecord(payload)
  return String(p.event_type ?? p.type ?? "bridge.unknown").trim()
}

export async function recordBridgeWebhookDelivery(payload: unknown): Promise<{ skipped: boolean }> {
  const p = asRecord(payload)
  const eventType = bridgeWebhookEventType(p)
  const eventId = bridgeWebhookEventId(p)
  const admin = createSupabaseAdmin()
  const { skipped } = await recordEventInbox(admin, {
    provider: "bridge",
    eventId,
    eventType,
    payload: p,
  })
  if (skipped) return { skipped: true }

  try {
    await applyBridgeWebhookSideEffects(admin, p)
    await markEventInboxProcessed(admin, "bridge", eventId, null)
    return { skipped: false }
  } catch (error) {
    const msg = formatWebhookProcessingError(error)
    await markEventInboxProcessed(admin, "bridge", eventId, msg)
    throw error
  }
}

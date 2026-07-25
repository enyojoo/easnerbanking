import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { recordEventInbox, markEventInboxProcessed } from "@/lib/webhooks/event-inbox"
import { applyGridWebhookSideEffects } from "./webhook-processor"
import { gridWebhookEventId, gridWebhookEventType } from "./webhook-event-id"

function formatWebhookProcessingError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === "object") {
    const o = error as Record<string, unknown>
    if (typeof o.message === "string" && o.message.trim()) return o.message
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }
  return String(error)
}

/**
 * Grid webhook ingress: dedupe via `event_inbox`, apply side effects, mark processed/failed.
 */
export async function recordGridWebhookDelivery(payload: unknown): Promise<{ skipped: boolean }> {
  const p = payload as Record<string, unknown>
  const eventType = gridWebhookEventType(p)
  const eventId = gridWebhookEventId(p)

  const admin = createSupabaseAdmin()
  const { skipped } = await recordEventInbox(admin, {
    provider: "grid",
    eventId,
    eventType,
    payload: p,
  })
  if (skipped) {
    return { skipped: true }
  }

  try {
    await applyGridWebhookSideEffects(admin, p)
    await markEventInboxProcessed(admin, "grid", eventId, null)
    return { skipped: false }
  } catch (error) {
    const msg = formatWebhookProcessingError(error)
    await markEventInboxProcessed(admin, "grid", eventId, msg)
    throw error
  }
}

import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { recordEventInbox, markEventInboxProcessed } from "@/lib/webhooks/event-inbox"
import {
  applyYellowcardWebhookSideEffects,
  yellowcardWebhookEventId,
  yellowcardWebhookEventType,
} from "@/lib/yellowcard/webhook-processor"

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
 * Yellowcard webhook ingress: dedupe via `event_inbox`, apply side effects, mark processed/failed.
 */
export async function recordYellowcardWebhookDelivery(
  payload: unknown,
): Promise<{ skipped: boolean }> {
  const p = payload as Record<string, unknown>
  const eventType = yellowcardWebhookEventType(p)
  const eventId = yellowcardWebhookEventId(p)

  const admin = createSupabaseAdmin()
  const { skipped } = await recordEventInbox(admin, {
    provider: "yellowcard",
    eventId,
    eventType,
    payload: p,
  })
  if (skipped) {
    return { skipped: true }
  }

  try {
    await applyYellowcardWebhookSideEffects(admin, p)
    await markEventInboxProcessed(admin, "yellowcard", eventId, null)
    return { skipped: false }
  } catch (error) {
    const msg = formatWebhookProcessingError(error)
    await markEventInboxProcessed(admin, "yellowcard", eventId, msg)
    throw error
  }
}

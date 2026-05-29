import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { recordEventInbox, markEventInboxProcessed } from "@/lib/webhooks/event-inbox"
import { applyNoahWebhookSideEffects } from "@/lib/noah/webhook-side-effects"
import { noahWebhookEventId } from "@/lib/noah/webhook-event-id"

function formatWebhookProcessingError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === "object") {
    const o = error as Record<string, unknown>
    if (typeof o.message === "string" && o.message.trim()) return o.message
    if (typeof o.details === "string" && o.details.trim()) return o.details
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }
  return String(error)
}

/**
 * Noah webhook ingress: dedupe via `event_inbox`, apply side effects, mark processed/failed.
 */
export async function recordNoahWebhookDelivery(payload: unknown): Promise<{ skipped: boolean }> {
  const p = payload as Record<string, unknown>
  const eventType = String(p.EventType ?? "")
  const eventId = noahWebhookEventId(p)

  const admin = createSupabaseAdmin()
  const { skipped } = await recordEventInbox(admin, {
    provider: "noah",
    eventId,
    eventType,
    payload: p,
  })
  if (skipped) {
    return { skipped: true }
  }

  try {
    await applyNoahWebhookSideEffects(admin, p)
    await markEventInboxProcessed(admin, "noah", eventId, null)
    return { skipped: false }
  } catch (error) {
    const msg = formatWebhookProcessingError(error)
    await markEventInboxProcessed(admin, "noah", eventId, msg)
    throw error
  }
}

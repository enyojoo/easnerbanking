import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { recordEventInbox, markEventInboxProcessed } from "@/lib/webhooks/event-inbox"
import { applyNoahWebhookSideEffects } from "@/lib/noah/webhook-side-effects"
import { noahWebhookEventId } from "@/lib/noah/webhook-event-id"

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
    const msg = error instanceof Error ? error.message : String(error)
    await markEventInboxProcessed(admin, "noah", eventId, msg)
    throw error
  }
}

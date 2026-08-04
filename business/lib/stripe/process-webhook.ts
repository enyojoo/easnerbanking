import type Stripe from "stripe"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { recordEventInbox, markEventInboxProcessed } from "@/lib/webhooks/event-inbox"
import { applyStripeWebhookSideEffects } from "./webhook-side-effects"

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
 * Stripe webhook ingress: dedupe via `event_inbox`, apply side effects, mark processed/failed.
 */
export async function recordStripeWebhookDelivery(
  event: Stripe.Event,
): Promise<{ skipped: boolean }> {
  const eventId = String(event.id || "").trim()
  const eventType = String(event.type || "").trim()
  if (!eventId) {
    throw new Error("Stripe event missing id")
  }

  const admin = createSupabaseAdmin()
  const { skipped } = await recordEventInbox(admin, {
    provider: "stripe",
    eventId,
    eventType,
    payload: event as unknown as Record<string, unknown>,
  })
  if (skipped) {
    return { skipped: true }
  }

  try {
    await applyStripeWebhookSideEffects(admin, event)
    await markEventInboxProcessed(admin, "stripe", eventId, null)
    return { skipped: false }
  } catch (error) {
    const msg = formatWebhookProcessingError(error)
    await markEventInboxProcessed(admin, "stripe", eventId, msg)
    throw error
  }
}

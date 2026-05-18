import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { recordEventInbox, markEventInboxProcessed } from "@/lib/webhooks/event-inbox"
import { applyNoahWebhookSideEffects } from "@/lib/noah/webhook-side-effects"

/**
 * Persist webhook (idempotent) and sync Customer events to users or businesses (Easner-shaped or stored ids).
 */
export async function recordNoahWebhookDelivery(payload: unknown): Promise<{ skipped: boolean }> {
  const p = payload as Record<string, unknown>
  const eventType = String(p.EventType ?? "")
  const eventVersion = String(p.EventVersion ?? "")
  const data = p.Data as Record<string, unknown> | undefined
  const customerId = data?.CustomerID != null ? String(data.CustomerID) : undefined
  const dedupeKey = `${eventType}-${eventVersion}-${customerId ?? "na"}`

  const admin = createSupabaseAdmin()
  const { data: delivery, error: insErr } = await admin
    .from("webhook_deliveries")
    .insert({
      dedupe_key: dedupeKey,
      event_type: eventType,
      noah_customer_id: customerId ?? null,
      event_version: eventVersion || null,
      payload: p as object,
      provider: "noah",
    })
    .select("id")
    .single()

  if (insErr?.code === "23505") {
    return { skipped: true }
  }
  if (insErr) throw insErr

  const deliveryId = delivery?.id as string | undefined
  if (deliveryId) {
    await recordEventInbox(admin, {
      provider: "noah",
      eventId: deliveryId,
      eventType,
      payload: p,
    })
  }

  try {
    await applyNoahWebhookSideEffects(admin, p)
    if (deliveryId) {
      await admin
        .from("webhook_deliveries")
        .update({ processed: true, processed_at: new Date().toISOString(), error: null })
        .eq("id", deliveryId)
      await markEventInboxProcessed(admin, "noah", deliveryId, null)
    }
    return { skipped: false }
  } catch (error) {
    if (deliveryId) {
      const msg = error instanceof Error ? error.message : String(error)
      await admin
        .from("webhook_deliveries")
        .update({
          processed: false,
          processed_at: new Date().toISOString(),
          error: msg,
        })
        .eq("id", deliveryId)
      await markEventInboxProcessed(admin, "noah", deliveryId, msg)
    }
    throw error
  }
}

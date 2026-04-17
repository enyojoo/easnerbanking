import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { markEventInboxProcessed } from "@/lib/webhooks/event-inbox"
import { applyNoahWebhookSideEffects } from "@/lib/noah/webhook-side-effects"

export async function replayFailedNoahEventInbox(limit: number): Promise<{
  replayed: number
  failed: number
}> {
  const admin = createSupabaseAdmin()
  const { data: rows, error } = await admin
    .from("event_inbox")
    .select("event_id, payload")
    .eq("provider", "noah")
    .eq("status", "failed")
    .order("received_at", { ascending: true })
    .limit(limit)

  if (error) throw error

  let replayed = 0
  let failed = 0
  for (const row of rows || []) {
    const eventId = String(row.event_id || "")
    try {
      await applyNoahWebhookSideEffects(admin, row.payload)
      if (eventId) {
        await markEventInboxProcessed(admin, "noah", eventId, null)
      }
      replayed++
    } catch (e) {
      failed++
      const msg = e instanceof Error ? e.message : String(e)
      if (eventId) {
        await markEventInboxProcessed(admin, "noah", eventId, msg)
      }
    }
  }
  return { replayed, failed }
}

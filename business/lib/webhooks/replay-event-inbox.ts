import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { markEventInboxProcessed } from "@/lib/webhooks/event-inbox"
import { applyNoahWebhookSideEffects } from "@/lib/noah/webhook-side-effects"
import { applyTurnkeyWebhookSideEffects } from "@/lib/turnkey/chain-sync"
import { applyYellowcardWebhookSideEffects } from "@/lib/yellowcard/webhook-processor"

export async function replayFailedNoahEventInbox(limit: number): Promise<{
  replayed: number
  failed: number
}> {
  return replayFailedEventInbox("noah", limit)
}

export async function replayFailedEventInbox(
  provider: "noah" | "turnkey" | "yellowcard",
  limit: number,
): Promise<{ replayed: number; failed: number }> {
  const admin = createSupabaseAdmin()
  const { data: rows, error } = await admin
    .from("event_inbox")
    .select("event_id, payload")
    .eq("provider", provider)
    .eq("status", "failed")
    .order("received_at", { ascending: true })
    .limit(limit)

  if (error) throw error

  let replayed = 0
  let failed = 0
  for (const row of rows || []) {
    const eventId = String(row.event_id || "")
    try {
      if (provider === "noah") {
        await applyNoahWebhookSideEffects(admin, row.payload)
      } else if (provider === "turnkey") {
        await applyTurnkeyWebhookSideEffects(admin, row.payload, eventId)
      } else {
        await applyYellowcardWebhookSideEffects(admin, row.payload as Record<string, unknown>)
      }
      if (eventId) {
        await markEventInboxProcessed(admin, provider, eventId, null)
      }
      replayed++
    } catch (e) {
      failed++
      const msg = e instanceof Error ? e.message : String(e)
      if (eventId) {
        await markEventInboxProcessed(admin, provider, eventId, msg)
      }
    }
  }
  return { replayed, failed }
}

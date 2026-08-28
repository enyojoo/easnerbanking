import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { markEventInboxProcessed } from "@/lib/webhooks/event-inbox"
import { applyNoahWebhookSideEffects } from "@/lib/noah/webhook-side-effects"
import { applyTurnkeyEventInboxSideEffects } from "@/lib/turnkey/turnkey-event-inbox-side-effects"
import { applyYellowcardWebhookSideEffects } from "@/lib/yellowcard/webhook-processor"

import { applyGridWebhookSideEffects } from "@/lib/grid/webhook-processor"

export async function replayFailedNoahEventInbox(limit: number): Promise<{
  replayed: number
  failed: number
}> {
  return replayFailedEventInbox("noah", limit)
}

export async function replayStaleReceivedEventInbox(
  provider: "noah" | "turnkey" | "yellowcard" | "grid",
  limit: number,
  minAgeMinutes: number,
): Promise<{ replayed: number; failed: number }> {
  const admin = createSupabaseAdmin()
  const cutoff = new Date(Date.now() - minAgeMinutes * 60 * 1000).toISOString()
  const { data: rows, error } = await admin
    .from("event_inbox")
    .select("event_id, payload")
    .eq("provider", provider)
    .eq("status", "received")
    .lte("received_at", cutoff)
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
        await applyTurnkeyEventInboxSideEffects(admin, row.payload, eventId)
      } else if (provider === "grid") {
        await applyGridWebhookSideEffects(admin, row.payload)
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

export async function replayFailedEventInbox(
  provider: "noah" | "turnkey" | "yellowcard" | "grid",
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
        await applyTurnkeyEventInboxSideEffects(admin, row.payload, eventId)
      } else if (provider === "grid") {
        await applyGridWebhookSideEffects(admin, row.payload)
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

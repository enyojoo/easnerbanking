import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

function hashPayload(payload: unknown): string {
  const s = typeof payload === "string" ? payload : JSON.stringify(payload)
  return createHash("sha256").update(s).digest("hex")
}

/**
 * Cross-provider webhook dedupe (`event_inbox`). Best-effort – failures do not block primary ingestion.
 */
export async function recordEventInbox(
  admin: SupabaseClient,
  params: {
    provider: "noah" | "turnkey" | "yellowcard" | "grid" | "bridge" | "stripe" | "relay" | "other"
    eventId: string
    eventType?: string
    payload: unknown
  },
): Promise<{ skipped: boolean }> {
  const payloadHash = hashPayload(params.payload)
  const { error } = await admin.from("event_inbox").insert({
    provider: params.provider,
    event_id: params.eventId,
    event_type: params.eventType ?? null,
    payload_hash: payloadHash,
    payload: params.payload as object,
    status: "received",
  })
  if (error?.code === "23505") {
    return { skipped: true }
  }
  if (error) {
    console.warn("[event_inbox] insert failed", error.message)
  }
  return { skipped: false }
}

export async function markEventInboxProcessed(
  admin: SupabaseClient,
  provider: string,
  eventId: string,
  err?: string | null,
): Promise<void> {
  await admin
    .from("event_inbox")
    .update({
      processed_at: new Date().toISOString(),
      status: err ? "failed" : "processed",
      error: err ?? null,
    })
    .eq("provider", provider)
    .eq("event_id", eventId)
}

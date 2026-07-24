import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { processGridWebhookPayload } from "./webhook-processor"

const seen = new Set<string>()

/** Idempotent Grid webhook ingress (dedupe by event id when present). */
export async function recordGridWebhookDelivery(payload: unknown): Promise<{ skipped: boolean }> {
  const event = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}
  const eventId = String(event.id ?? event.eventId ?? "").trim()

  if (eventId) {
    if (seen.has(eventId)) return { skipped: true }
    seen.add(eventId)
    if (seen.size > 5000) seen.clear()
  }

  try {
    const admin = createSupabaseAdmin()
    if (eventId) {
      const { count } = await admin
        .from("webhook_events")
        .select("id", { count: "exact", head: true })
        .eq("provider", "grid")
        .filter("payload->>id", "eq", eventId)
      if ((count ?? 0) > 0) return { skipped: true }
    }

    await admin.from("webhook_events").insert({
      provider: "grid",
      payload: event,
      received_at: new Date().toISOString(),
    })
  } catch {
    // non-fatal if inbox table missing
  }

  return processGridWebhookPayload(payload)
}

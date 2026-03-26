import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { parseEasnerUserIdFromNoahCustomerId } from "@/lib/noah/customer-id"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"

/**
 * Persist webhook (idempotent) and sync Customer events to public.users when CustomerID is Easner-shaped.
 */
export async function recordNoahWebhookDelivery(payload: unknown): Promise<{ skipped: boolean }> {
  const p = payload as Record<string, unknown>
  const eventType = String(p.EventType ?? "")
  const eventVersion = String(p.EventVersion ?? "")
  const data = p.Data as Record<string, unknown> | undefined
  const customerId = data?.CustomerID != null ? String(data.CustomerID) : undefined
  const dedupeKey = `${eventType}-${eventVersion}-${customerId ?? "na"}`

  const admin = createSupabaseAdmin()
  const { error: insErr } = await admin.from("noah_webhook_deliveries").insert({
    dedupe_key: dedupeKey,
    event_type: eventType,
    noah_customer_id: customerId ?? null,
    event_version: eventVersion || null,
    payload: p as object,
  })

  if (insErr?.code === "23505") {
    return { skipped: true }
  }
  if (insErr) {
    throw insErr
  }

  if (eventType === "Customer" && customerId) {
    const parsed = parseEasnerUserIdFromNoahCustomerId(customerId)
    if (parsed && data) {
      const customerLike: Record<string, unknown> = {
        ...data,
        Verifications: data.Verifications,
      }
      await syncNoahCustomerToSupabase(parsed.userId, customerLike, customerId, parsed.scope)
    }
  }

  return { skipped: false }
}

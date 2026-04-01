import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { parseEasnerUserIdFromNoahCustomerId } from "@/lib/noah/customer-id"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"
import { mapNoahVerificationToKycStatus } from "@/lib/noah/map-kyc"
import { pickTxAmountAndCurrency } from "@/lib/noah/map-transactions"
import { provisionNoahArtifactsForCustomer } from "@/lib/noah/provisioning"

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

  try {
    if (eventType === "Transaction" && data) {
      const txData = data as Record<string, unknown>
      const txCustomerId = txData.CustomerID != null ? String(txData.CustomerID) : customerId
      const parsed = txCustomerId ? parseEasnerUserIdFromNoahCustomerId(txCustomerId) : null
      if (parsed) {
        const id = String(txData.ID ?? "")
        const { amount, currency } = pickTxAmountAndCurrency(txData)
        const directionRaw = String(txData.Direction ?? "").toLowerCase()
        const direction = directionRaw === "in" ? "in" : directionRaw === "out" ? "out" : null
        const status = String(txData.Status ?? "").toLowerCase() || "unknown"
        const { error: txErr } = await admin.from("transactions").upsert(
          {
            user_id: parsed.userId,
            provider: "noah",
            noah_transaction_id: id || null,
            status,
            amount,
            currency,
            direction,
            payload: txData,
            metadata: {
              source: "webhook_transaction",
            },
          },
          { onConflict: "provider,noah_transaction_id" }
        )
        if (txErr) throw txErr
      }
    }

    if (eventType === "Customer" && customerId) {
      const parsed = parseEasnerUserIdFromNoahCustomerId(customerId)
      if (parsed && data) {
        const customerLike: Record<string, unknown> = {
          ...data,
          Verifications: data.Verifications,
        }
        await syncNoahCustomerToSupabase(parsed.userId, customerLike, customerId, parsed.scope)
        const mappedStatus = mapNoahVerificationToKycStatus(customerLike)
        if (mappedStatus === "approved") {
          await provisionNoahArtifactsForCustomer({
            subjectUserId: parsed.userId,
            noahCustomerId: customerId,
            scope: parsed.scope,
          })
        }
      }
    }

    if (deliveryId) {
      await admin
        .from("webhook_deliveries")
        .update({ processed: true, processed_at: new Date().toISOString(), error: null })
        .eq("id", deliveryId)
    }
    return { skipped: false }
  } catch (error) {
    if (deliveryId) {
      await admin
        .from("webhook_deliveries")
        .update({
          processed: false,
          processed_at: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        })
        .eq("id", deliveryId)
    }
    throw error
  }
}

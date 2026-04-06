import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { parseEasnerNoahCustomerId } from "@/lib/noah/customer-id"
import { syncNoahCustomerToSupabase } from "@/lib/noah/sync-user"
import { mapNoahVerificationToKycStatus } from "@/lib/noah/map-kyc"
import { pickTxAmountAndCurrency } from "@/lib/noah/map-transactions"
import { provisionNoahArtifactsForCustomer } from "@/lib/noah/provisioning"

/**
 * Persist webhook (idempotent) and sync Customer events to users or businesses when CustomerID is Easner-shaped.
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
      const parsed = txCustomerId ? parseEasnerNoahCustomerId(txCustomerId) : null
      if (parsed) {
        const id = String(txData.ID ?? "")
        const { amount, currency } = pickTxAmountAndCurrency(txData)
        const directionRaw = String(txData.Direction ?? "").toLowerCase()
        const direction = directionRaw === "in" ? "in" : directionRaw === "out" ? "out" : null
        const status = String(txData.Status ?? "").toLowerCase() || "unknown"

        let userId: string | null = null
        let businessId: string | null = null
        if (parsed.kind === "individual") {
          userId = parsed.userId
        } else {
          businessId = parsed.businessId
          userId = await resolveBusinessOrgOwnerUserId(admin, parsed.businessId)
        }

        const externalIdRaw = txData.ExternalID ?? txData.externalID ?? txData.ExternalId
        const externalId =
          externalIdRaw != null && String(externalIdRaw).trim() ? String(externalIdRaw).trim() : null
        if (externalId) {
          const { data: terminalSession } = await admin
            .from("terminal_sessions")
            .select("id, status")
            .eq("id", externalId)
            .maybeSingle()
          if (terminalSession?.id) {
            const st = String(txData.Status ?? "").toLowerCase()
            const dir = String(txData.Direction ?? "").toLowerCase()
            let nextStatus: string | null = null
            if (st === "failed" || st === "cancelled") {
              nextStatus = "failed"
            } else if (st === "settled") {
              nextStatus = dir === "in" ? "deposit_detected" : "payout_complete"
            } else if (st === "pending") {
              nextStatus = dir === "in" ? "deposit_detected" : "payout_pending"
            }
            if (nextStatus && nextStatus !== terminalSession.status) {
              await admin
                .from("terminal_sessions")
                .update({ status: nextStatus, updated_at: new Date().toISOString() })
                .eq("id", externalId)
            }
          }
        }

        if (userId) {
          const { error: txErr } = await admin.from("transactions").upsert(
            {
              user_id: userId,
              business_id: businessId,
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
            { onConflict: "provider,noah_transaction_id" },
          )
          if (txErr) throw txErr
        }
      }
    }

    if (eventType === "Customer" && customerId) {
      const parsed = parseEasnerNoahCustomerId(customerId)
      if (parsed && data) {
        const customerLike: Record<string, unknown> = {
          ...data,
          Verifications: data.Verifications,
        }
        if (parsed.kind === "individual") {
          await syncNoahCustomerToSupabase(
            { kind: "individual", userId: parsed.userId },
            customerLike,
            customerId,
          )
        } else {
          await syncNoahCustomerToSupabase(
            { kind: "business", businessId: parsed.businessId },
            customerLike,
            customerId,
          )
        }
        const mappedStatus = mapNoahVerificationToKycStatus(customerLike)
        if (mappedStatus === "approved") {
          if (parsed.kind === "individual") {
            await provisionNoahArtifactsForCustomer({
              subjectUserId: parsed.userId,
              subjectBusinessId: null,
              noahCustomerId: customerId,
              scope: "individual",
            })
          } else {
            const ownerId = await resolveBusinessOrgOwnerUserId(admin, parsed.businessId)
            if (ownerId) {
              await provisionNoahArtifactsForCustomer({
                subjectUserId: ownerId,
                subjectBusinessId: parsed.businessId,
                noahCustomerId: customerId,
                scope: "business",
              })
            }
          }
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

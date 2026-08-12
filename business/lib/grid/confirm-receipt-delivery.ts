import type { SupabaseClient } from "@supabase/supabase-js"
import { gridFetch } from "./http"

/**
 * Confirm receipt delivery to Grid after SendGrid succeeds.
 * @see https://docs.lightspark.com/payouts-and-b2b/payment-flow/receipts
 */
export async function confirmGridReceiptDelivery(input: {
  admin: SupabaseClient
  ledgerTransactionId: string
  gridTransactionId: string
  metadata?: Record<string, unknown> | null
  receiptDeliveryConfirmedAt?: string
}): Promise<{ confirmed: boolean; skipped: boolean }> {
  const gridTransactionId = String(input.gridTransactionId ?? "").trim()
  if (!gridTransactionId) {
    return { confirmed: false, skipped: true }
  }

  const meta =
    input.metadata && typeof input.metadata === "object"
      ? { ...input.metadata }
      : ({} as Record<string, unknown>)

  if (typeof meta.grid_receipt_delivered_at === "string" && meta.grid_receipt_delivered_at.trim()) {
    return { confirmed: false, skipped: true }
  }

  const confirmedAt =
    input.receiptDeliveryConfirmedAt?.trim() || new Date().toISOString()

  await gridFetch({
    method: "POST",
    path: `/transactions/${encodeURIComponent(gridTransactionId)}/confirm`,
    json: { receiptDeliveryConfirmedAt: confirmedAt },
  })

  const nextMeta = {
    ...meta,
    grid_receipt_delivered_at: confirmedAt,
  }

  await input.admin
    .from("transactions")
    .update({
      metadata: nextMeta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.ledgerTransactionId)

  return { confirmed: true, skipped: false }
}

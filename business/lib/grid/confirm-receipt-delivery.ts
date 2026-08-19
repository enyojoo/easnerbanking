import type { SupabaseClient } from "@supabase/supabase-js"
import { gridFetch } from "./http"
import { isSuccessfulGridTransactionStatus } from "./webhook-status"

function asMeta(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? { ...(value as Record<string, unknown>) } : {}
}

/**
 * Confirm receipt delivery to Grid after SendGrid succeeds.
 * Never confirm a failed or refunded Grid payout.
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

  const meta = asMeta(input.metadata)
  if (typeof meta.grid_receipt_delivered_at === "string" && meta.grid_receipt_delivered_at.trim()) {
    return { confirmed: false, skipped: true }
  }
  if (
    meta.grid_refund_expected === true ||
    String(meta.failure_reason ?? "").trim() ||
    String(meta.grid_webhook_status ?? "").toUpperCase().includes("FAIL") ||
    String(meta.grid_webhook_status ?? "").toUpperCase().includes("REFUND")
  ) {
    return { confirmed: false, skipped: true }
  }

  const remote = await gridFetch<{ status?: string }>({
    method: "GET",
    path: `/transactions/${encodeURIComponent(gridTransactionId)}`,
  })
  if (!isSuccessfulGridTransactionStatus(remote?.status)) {
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

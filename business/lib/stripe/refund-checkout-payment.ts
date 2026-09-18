import type { SupabaseClient } from "@supabase/supabase-js"
import { applyCheckoutStripeRefund } from "./apply-checkout-stripe-refund"
import { applyInvoiceStripeRefundSideEffects } from "./apply-invoice-stripe-refund"
import { createStripeDestinationRefund } from "./create-destination-refund"
import { isOnlineCheckoutEnabled } from "./config"

export type RefundCheckoutPaymentResult =
  | { ok: true; refundId: string; status: string }
  | { ok: false; error: string; status: number }

/**
 * Full refund of a collection settlement (Payment Link, website embed, or
 * dual-written invoice). Refund the Direct Charge on the connected account,
 * then fail the settlement and its ledger entry.
 */
export async function refundCheckoutPayment(
  admin: SupabaseClient,
  input: {
    businessId: string
    settlementId: string
  },
): Promise<RefundCheckoutPaymentResult> {
  if (!isOnlineCheckoutEnabled()) {
    return { ok: false, error: "Online payments are not enabled", status: 503 }
  }

  const { data: settlement, error } = await admin
    .from("checkout_stripe_settlements")
    .select(
      "id, stripe_payment_intent_id, phase, stripe_transfer_id, stripe_connected_account_id, stripe_refund_id, source, invoice_id",
    )
    .eq("id", input.settlementId)
    .eq("business_id", input.businessId)
    .maybeSingle()

  if (error) return { ok: false, error: error.message, status: 500 }
  if (!settlement?.stripe_payment_intent_id) {
    return { ok: false, error: "No payment found to refund", status: 404 }
  }
  if (settlement.stripe_refund_id) {
    return { ok: false, error: "This payment was already refunded", status: 409 }
  }
  if (settlement.phase === "credited") {
    return {
      ok: false,
      error: "Funds already reached the Easner Balance; contact support for a clawback",
      status: 409,
    }
  }

  const refund = await createStripeDestinationRefund({
    paymentIntentId: String(settlement.stripe_payment_intent_id),
    businessId: input.businessId,
    settlementId: String(settlement.id),
    stripeAccountId: settlement.stripe_connected_account_id
      ? String(settlement.stripe_connected_account_id)
      : null,
    idempotencyKey: `checkout_refund_${settlement.id}`,
    extraMetadata:
      typeof settlement.invoice_id === "string" ? { invoice_id: settlement.invoice_id } : undefined,
  })
  if (!refund.ok) {
    return { ok: false, error: refund.error, status: 502 }
  }

  await applyCheckoutStripeRefund(admin, {
    settlementId: String(settlement.id),
    refundId: refund.refundId,
  })

  if (settlement.source === "invoice" && typeof settlement.invoice_id === "string") {
    await applyInvoiceStripeRefundSideEffects(admin, {
      settlementId: String(settlement.id),
      refundId: refund.refundId,
      source: "api",
    })
  }

  return { ok: true, refundId: refund.refundId, status: refund.status }
}

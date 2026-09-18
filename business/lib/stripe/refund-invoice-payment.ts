import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { isStripeInvoicePaymentsEnabled } from "@/lib/stripe/config"
import { applyInvoiceStripeRefundSideEffects } from "@/lib/stripe/apply-invoice-stripe-refund"
import { createStripeDestinationRefund } from "@/lib/stripe/create-destination-refund"
import type { Invoice } from "@/lib/b2b/types"

export type RefundInvoicePaymentResult =
  | {
      ok: true
      refundId: string
      status: string
      invoiceStatus: Invoice["status"]
      ledgerTransactionId: string | null
    }
  | { ok: false; error: string; status: number }

/**
 * Full refund of a Stripe invoice payment on the connected account.
 * Applies shared side effects: settlement failed, ledger failed, invoice payable again.
 */
export async function refundInvoiceStripePayment(input: {
  businessId: string
  invoiceId: string
  actorUserId?: string | null
}): Promise<RefundInvoicePaymentResult> {
  if (!isStripeInvoicePaymentsEnabled()) {
    return { ok: false, error: "Stripe invoice payments are not enabled", status: 503 }
  }

  const admin = createSupabaseAdmin()
  let { data: settlement, error } = await admin
    .from("invoice_stripe_settlements")
    .select(
      "id,stripe_payment_intent_id,phase,currency,net_cents,ledger_transaction_id,stripe_transfer_id,stripe_connected_account_id",
    )
    .eq("invoice_id", input.invoiceId)
    .eq("business_id", input.businessId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return { ok: false, error: error.message, status: 500 }
  }
  if (!settlement?.stripe_payment_intent_id) {
    const fallback = await admin
      .from("checkout_stripe_settlements")
      .select(
        "id,stripe_payment_intent_id,phase,currency,net_cents,ledger_transaction_id,stripe_transfer_id,stripe_connected_account_id",
      )
      .eq("invoice_id", input.invoiceId)
      .eq("business_id", input.businessId)
      .eq("source", "invoice")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    settlement = fallback.data
    error = fallback.error
    if (error) return { ok: false, error: error.message, status: 500 }
  }
  if (!settlement?.stripe_payment_intent_id) {
    return { ok: false, error: "No Stripe settlement found for this invoice", status: 404 }
  }
  if (settlement.phase === "failed") {
    return { ok: false, error: "Settlement already marked failed / refunded", status: 409 }
  }
  if (settlement.phase === "credited") {
    return {
      ok: false,
      error: "Funds are already credited to the wallet; contact support for a clawback",
      status: 409,
    }
  }

  const refund = await createStripeDestinationRefund({
    paymentIntentId: settlement.stripe_payment_intent_id,
    businessId: input.businessId,
    settlementId: settlement.id,
    stripeAccountId: settlement.stripe_connected_account_id,
    idempotencyKey: `stripe_refund_${settlement.id}`,
    extraMetadata: { invoice_id: input.invoiceId },
  })
  if (!refund.ok) {
    return { ok: false, error: refund.error, status: 502 }
  }

  const sideEffects = await applyInvoiceStripeRefundSideEffects(admin, {
    settlementId: String(settlement.id),
    refundId: refund.refundId,
    refundedAt: new Date().toISOString(),
    source: "api",
    actorUserId: input.actorUserId ?? null,
  })

  if (!sideEffects.ok) {
    return { ok: false, error: sideEffects.error, status: 500 }
  }

  return {
    ok: true,
    refundId: refund.refundId,
    status: refund.status,
    invoiceStatus: sideEffects.restoredStatus ?? "unpaid",
    ledgerTransactionId: sideEffects.ledgerTransactionId ?? null,
  }
}

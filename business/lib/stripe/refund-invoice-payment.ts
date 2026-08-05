import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { getStripe } from "@/lib/stripe/client"
import { isStripeInvoicePaymentsEnabled } from "@/lib/stripe/config"
import { applyInvoiceStripeRefundSideEffects } from "@/lib/stripe/apply-invoice-stripe-refund"
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
 * Full refund of a Stripe invoice payment on the platform account.
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
  const { data: settlement, error } = await admin
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

  const stripe = getStripe()
  const hasDestinationTransfer = Boolean(
    settlement.stripe_transfer_id || settlement.stripe_connected_account_id,
  )
  let refund
  try {
    refund = await stripe.refunds.create(
      {
        payment_intent: settlement.stripe_payment_intent_id,
        reason: "requested_by_customer",
        // Destination charges: pull funds back from the connected account.
        ...(hasDestinationTransfer ? { reverse_transfer: true } : {}),
        metadata: {
          invoice_id: input.invoiceId,
          business_id: input.businessId,
          easner_settlement_id: settlement.id,
        },
      },
      { idempotencyKey: `stripe_refund_${settlement.id}` },
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe refund failed"
    return { ok: false, error: message, status: 502 }
  }

  const sideEffects = await applyInvoiceStripeRefundSideEffects(admin, {
    settlementId: String(settlement.id),
    refundId: refund.id,
    refundedAt: new Date().toISOString(),
    source: "api",
    actorUserId: input.actorUserId ?? null,
  })

  if (!sideEffects.ok) {
    return { ok: false, error: sideEffects.error, status: 500 }
  }

  return {
    ok: true,
    refundId: refund.id,
    status: refund.status ?? "succeeded",
    invoiceStatus: sideEffects.restoredStatus ?? "unpaid",
    ledgerTransactionId: sideEffects.ledgerTransactionId ?? null,
  }
}

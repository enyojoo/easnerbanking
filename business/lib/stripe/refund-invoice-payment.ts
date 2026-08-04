import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { getStripe } from "@/lib/stripe/client"
import { isStripeInvoicePaymentsEnabled } from "@/lib/stripe/config"

export type RefundInvoicePaymentResult =
  | { ok: true; refundId: string; status: string }
  | { ok: false; error: string; status: number }

/**
 * Full refund of a Stripe invoice payment on the platform account.
 * Marks settlement phase failed and updates invoice paymentInfo note.
 */
export async function refundInvoiceStripePayment(input: {
  businessId: string
  invoiceId: string
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

  const now = new Date().toISOString()
  await admin
    .from("invoice_stripe_settlements")
    .update({ phase: "failed", updated_at: now })
    .eq("id", settlement.id)

  if (settlement.ledger_transaction_id) {
    const { data: ledgerRow } = await admin
      .from("ledger_transactions")
      .select("metadata")
      .eq("id", settlement.ledger_transaction_id)
      .maybeSingle()
    const priorMeta =
      ledgerRow?.metadata && typeof ledgerRow.metadata === "object"
        ? (ledgerRow.metadata as Record<string, unknown>)
        : {}
    await admin
      .from("ledger_transactions")
      .update({
        status: "failed",
        metadata: {
          ...priorMeta,
          settlement_phase: "failed",
          stripe_refund_id: refund.id,
          failed_at: now,
        },
      })
      .eq("id", settlement.ledger_transaction_id)
  }

  const { data: invoiceRow } = await admin
    .from("invoices")
    .select("metadata")
    .eq("id", input.invoiceId)
    .eq("business_id", input.businessId)
    .maybeSingle()

  if (invoiceRow?.metadata && typeof invoiceRow.metadata === "object") {
    const meta = { ...(invoiceRow.metadata as Record<string, unknown>) }
    const paymentInfo = (meta.paymentInfo ?? {}) as Record<string, unknown>
    const stripeInfo = (paymentInfo.stripe ?? {}) as Record<string, unknown>
    meta.paymentInfo = {
      ...paymentInfo,
      stripe: {
        ...stripeInfo,
        settlementPhase: "failed",
        refundId: refund.id,
      },
    }
    await admin
      .from("invoices")
      .update({ metadata: meta, updated_at: now })
      .eq("id", input.invoiceId)
      .eq("business_id", input.businessId)
  }

  return { ok: true, refundId: refund.id, status: refund.status ?? "succeeded" }
}

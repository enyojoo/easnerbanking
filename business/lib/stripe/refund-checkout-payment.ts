import type { SupabaseClient } from "@supabase/supabase-js"
import { applyCheckoutStripeRefund } from "./apply-checkout-stripe-refund"
import { getStripe } from "./client"
import { isOnlineCheckoutEnabled } from "./config"

export type RefundCheckoutPaymentResult =
  | { ok: true; refundId: string; status: string }
  | { ok: false; error: string; status: number }

/**
 * Full refund of a Payment Link or website-embed collection. Mirrors the invoice
 * refund path: reverse the destination transfer, then fail the settlement and its
 * ledger entry. Refunds after the balance is credited need an ops clawback.
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
      "id, stripe_payment_intent_id, phase, stripe_transfer_id, stripe_connected_account_id, stripe_refund_id",
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

  const hasDestinationTransfer = Boolean(
    settlement.stripe_transfer_id || settlement.stripe_connected_account_id,
  )

  let refund
  try {
    refund = await getStripe().refunds.create(
      {
        payment_intent: String(settlement.stripe_payment_intent_id),
        reason: "requested_by_customer",
        ...(hasDestinationTransfer ? { reverse_transfer: true } : {}),
        metadata: {
          business_id: input.businessId,
          easner_settlement_id: String(settlement.id),
        },
      },
      { idempotencyKey: `checkout_refund_${settlement.id}` },
    )
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Refund failed",
      status: 502,
    }
  }

  await applyCheckoutStripeRefund(admin, {
    settlementId: String(settlement.id),
    refundId: refund.id,
  })

  return { ok: true, refundId: refund.id, status: refund.status ?? "succeeded" }
}

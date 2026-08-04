import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { handleStripeCheckoutCompleted } from "./handle-checkout-completed"
import { handleStripePayoutPaid } from "./handle-payout-paid"

/**
 * Route Stripe webhook events to hop handlers.
 */
export async function applyStripeWebhookSideEffects(
  admin: SupabaseClient,
  event: Stripe.Event,
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
    case "payment_intent.succeeded": {
      await handleStripeCheckoutCompleted(admin, event)
      return
    }
    case "payout.paid":
    case "payout.failed": {
      await handleStripePayoutPaid(admin, event)
      return
    }
    case "charge.dispute.created": {
      const dispute = event.data.object as Stripe.Dispute
      const chargeId =
        typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id
      if (!chargeId) return
      const { data: settlement } = await admin
        .from("invoice_stripe_settlements")
        .select("id,stripe_event_ids")
        .eq("stripe_charge_id", chargeId)
        .maybeSingle()
      if (!settlement?.id) return
      const prior = Array.isArray(settlement.stripe_event_ids)
        ? settlement.stripe_event_ids
        : []
      await admin
        .from("invoice_stripe_settlements")
        .update({
          stripe_event_ids: [...prior, event.id],
          updated_at: new Date().toISOString(),
        })
        .eq("id", settlement.id)
      console.warn("[stripe] dispute created for settlement", settlement.id, dispute.id)
      return
    }
    default:
      return
  }
}

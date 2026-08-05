import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { syncConnectAccountFromWebhook } from "./connect"
import { handleStripeCheckoutCompleted } from "./handle-checkout-completed"
import { handleStripePayoutPaid } from "./handle-payout-paid"
import { applyInvoiceStripeRefundSideEffects } from "./apply-invoice-stripe-refund"

async function appendSettlementEvent(
  admin: SupabaseClient,
  settlementId: string,
  eventId: string,
  patch?: Record<string, unknown>,
): Promise<void> {
  const { data: settlement } = await admin
    .from("invoice_stripe_settlements")
    .select("id,stripe_event_ids")
    .eq("id", settlementId)
    .maybeSingle()
  if (!settlement?.id) return
  const prior = Array.isArray(settlement.stripe_event_ids) ? settlement.stripe_event_ids : []
  await admin
    .from("invoice_stripe_settlements")
    .update({
      ...patch,
      stripe_event_ids: [...prior, eventId],
      updated_at: new Date().toISOString(),
    })
    .eq("id", settlement.id)
}

async function findSettlementByCharge(
  admin: SupabaseClient,
  chargeId: string,
): Promise<{
  id: string
  phase: string
  stripe_transfer_id: string | null
  ledger_transaction_id: string | null
} | null> {
  const { data } = await admin
    .from("invoice_stripe_settlements")
    .select("id,phase,stripe_transfer_id,ledger_transaction_id")
    .eq("stripe_charge_id", chargeId)
    .maybeSingle()
  return data
    ? {
        id: String(data.id),
        phase: String(data.phase),
        stripe_transfer_id: data.stripe_transfer_id ? String(data.stripe_transfer_id) : null,
        ledger_transaction_id: data.ledger_transaction_id
          ? String(data.ledger_transaction_id)
          : null,
      }
    : null
}

/**
 * Route Stripe webhook events to hop handlers.
 */
export async function applyStripeWebhookSideEffects(
  admin: SupabaseClient,
  event: Stripe.Event,
): Promise<void> {
  switch (event.type) {
    case "account.updated": {
      await syncConnectAccountFromWebhook(admin, event)
      return
    }
    case "checkout.session.completed":
    case "payment_intent.succeeded": {
      await handleStripeCheckoutCompleted(admin, event)
      return
    }
    case "payout.paid":
    case "payout.failed": {
      // Settlement payouts are on connected accounts; ignore platform-level payouts.
      if (!event.account) {
        console.info("[stripe] ignoring platform payout event", event.id)
        return
      }
      await handleStripePayoutPaid(admin, event)
      return
    }
    case "charge.dispute.created": {
      const dispute = event.data.object as Stripe.Dispute
      const chargeId =
        typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id
      if (!chargeId) return
      const settlement = await findSettlementByCharge(admin, chargeId)
      if (!settlement) return
      await appendSettlementEvent(admin, settlement.id, event.id, {
        // Keep phase unless already credited — ops handles clawback.
        ...(settlement.phase === "payment_received" ? {} : {}),
      })
      // Tag invoice metadata for ops visibility
      const { data: row } = await admin
        .from("invoice_stripe_settlements")
        .select("invoice_id")
        .eq("id", settlement.id)
        .maybeSingle()
      if (row?.invoice_id) {
        const { data: inv } = await admin
          .from("invoices")
          .select("metadata")
          .eq("id", row.invoice_id)
          .maybeSingle()
        if (inv?.metadata && typeof inv.metadata === "object") {
          const meta = { ...(inv.metadata as Record<string, unknown>) }
          const paymentInfo = (meta.paymentInfo ?? {}) as Record<string, unknown>
          const stripeInfo = (paymentInfo.stripe ?? {}) as Record<string, unknown>
          meta.paymentInfo = {
            ...paymentInfo,
            stripe: {
              ...stripeInfo,
              disputeId: dispute.id,
              disputeStatus: dispute.status,
            },
          }
          await admin.from("invoices").update({ metadata: meta }).eq("id", row.invoice_id)
        }
      }
      console.warn("[stripe] dispute created for settlement", settlement.id, dispute.id, {
        phase: settlement.phase,
        transferId: settlement.stripe_transfer_id,
      })
      return
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge
      const refundFromList =
        charge.refunds &&
        typeof charge.refunds === "object" &&
        Array.isArray(charge.refunds.data) &&
        charge.refunds.data[0]?.id
          ? String(charge.refunds.data[0].id)
          : null
      const refundId = refundFromList || `charge_refunded:${charge.id}`
      const result = await applyInvoiceStripeRefundSideEffects(admin, {
        chargeId: charge.id,
        refundId,
        refundedAt: new Date((event.created || 0) * 1000).toISOString(),
        source: "webhook",
        stripeEventId: event.id,
      })
      if (result.ok && result.skipped === "credited") {
        console.warn(
          "[stripe] refund after credited — manual clawback required",
          result.invoiceId,
          charge.id,
        )
      } else if (!result.ok) {
        console.error("[stripe] charge.refunded side effects failed:", result.error)
      }
      return
    }
    case "refund.created": {
      const refund = event.data.object as Stripe.Refund
      const chargeId =
        typeof refund.charge === "string" ? refund.charge : refund.charge?.id
      if (!chargeId || !refund.id) return
      const result = await applyInvoiceStripeRefundSideEffects(admin, {
        chargeId,
        refundId: refund.id,
        refundedAt: new Date((event.created || 0) * 1000).toISOString(),
        source: "webhook",
        stripeEventId: event.id,
      })
      if (!result.ok) {
        console.error("[stripe] refund.created side effects failed:", result.error)
      }
      return
    }
    case "transfer.created": {
      const transfer = event.data.object as Stripe.Transfer
      const chargeId =
        typeof transfer.source_transaction === "string"
          ? transfer.source_transaction
          : transfer.source_transaction && typeof transfer.source_transaction === "object"
            ? transfer.source_transaction.id
            : null
      if (!chargeId) {
        console.info("[stripe] transfer.created without source_transaction", transfer.id)
        return
      }
      const settlement = await findSettlementByCharge(admin, chargeId)
      if (!settlement) {
        console.info("[stripe] transfer.created no settlement for charge", transfer.id, chargeId)
        return
      }
      if (!settlement.stripe_transfer_id) {
        await appendSettlementEvent(admin, settlement.id, event.id, {
          stripe_transfer_id: transfer.id,
        })
        if (settlement.ledger_transaction_id) {
          const { data: ledgerRow } = await admin
            .from("transactions")
            .select("id,metadata")
            .eq("id", settlement.ledger_transaction_id)
            .maybeSingle()
          if (ledgerRow?.id && ledgerRow.metadata && typeof ledgerRow.metadata === "object") {
            const meta = { ...(ledgerRow.metadata as Record<string, unknown>) }
            if (!meta.stripe_transfer_id) {
              meta.stripe_transfer_id = transfer.id
              await admin
                .from("transactions")
                .update({ metadata: meta })
                .eq("id", ledgerRow.id)
            }
          }
        }
      } else {
        await appendSettlementEvent(admin, settlement.id, event.id)
      }
      console.info(
        "[stripe] transfer.created",
        transfer.id,
        "→",
        typeof transfer.destination === "string" ? transfer.destination : null,
        "settlement",
        settlement.id,
      )
      return
    }
    default:
      return
  }
}

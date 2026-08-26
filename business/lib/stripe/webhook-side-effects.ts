import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { dispatchMerchantWebhook } from "@/lib/checkout/merchant-webhooks"
import { syncConnectAccountFromWebhook } from "./connect"
import { handleStripeCheckoutCompleted, handleStripeChargeSucceededForInvoice } from "./handle-checkout-completed"
import { handleStripePayoutPaid } from "./handle-payout-paid"
import { handleSubscriptionLifecycleEvent } from "./handle-subscription-lifecycle"
import { applyCheckoutStripeRefund } from "./apply-checkout-stripe-refund"
import { applyInvoiceStripeRefundSideEffects } from "./apply-invoice-stripe-refund"
import { trackServerEmbedPayerPaymentFailed } from "@/lib/server-analytics"

async function appendSettlementEvent(
  admin: SupabaseClient,
  settlement: { table: string; id: string },
  eventId: string,
  patch?: Record<string, unknown>,
): Promise<void> {
  const { data: row } = await admin
    .from(settlement.table)
    .select("id,stripe_event_ids")
    .eq("id", settlement.id)
    .maybeSingle()
  if (!row?.id) return
  const prior = Array.isArray(row.stripe_event_ids) ? row.stripe_event_ids : []
  await admin
    .from(settlement.table)
    .update({
      ...patch,
      stripe_event_ids: [...prior, eventId],
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
}

type SettlementByCharge = {
  table: string
  id: string
  businessId: string
  phase: string
  stripe_transfer_id: string | null
  ledger_transaction_id: string | null
  invoiceId: string | null
}

async function findSettlementByCharge(
  admin: SupabaseClient,
  chargeId: string,
): Promise<SettlementByCharge | null> {
  const tables = [
    { table: "invoice_stripe_settlements", columns: "id,business_id,phase,stripe_transfer_id,ledger_transaction_id,invoice_id" },
    { table: "checkout_stripe_settlements", columns: "id,business_id,phase,stripe_transfer_id,ledger_transaction_id" },
  ]
  for (const { table, columns } of tables) {
    const { data } = await admin
      .from(table)
      .select(columns)
      .eq("stripe_charge_id", chargeId)
      .maybeSingle()
    const row = data as Record<string, unknown> | null
    if (!row?.id) continue
    return {
      table,
      id: String(row.id),
      businessId: String(row.business_id),
      phase: String(row.phase),
      stripe_transfer_id: row.stripe_transfer_id ? String(row.stripe_transfer_id) : null,
      ledger_transaction_id: row.ledger_transaction_id ? String(row.ledger_transaction_id) : null,
      invoiceId: row.invoice_id ? String(row.invoice_id) : null,
    }
  }
  return null
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
    case "charge.succeeded": {
      const charge = event.data.object as Stripe.Charge
      const source = String(charge.metadata?.easner_checkout_source ?? "").trim()
      if (source === "payment_link" || source === "embed") {
        const businessId = String(charge.metadata?.easner_business_id ?? "").trim()
        if (businessId) {
          await dispatchMerchantWebhook(admin, {
            businessId,
            event: "checkout.async_succeeded",
            data: {
              amount_cents: charge.amount,
              currency: String(charge.currency || "usd").toUpperCase(),
              ...(charge.metadata?.easner_payment_link_id
                ? { payment_link_id: String(charge.metadata.easner_payment_link_id) }
                : {}),
            },
          })
        }
        return
      }
      await handleStripeChargeSucceededForInvoice(admin, charge)
      return
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent
      const source = String(pi.metadata?.easner_checkout_source ?? "").trim()
      const businessId = String(pi.metadata?.easner_business_id ?? "").trim()
      const settlementId = String(pi.metadata?.easner_settlement_id ?? "").trim()
      if ((source !== "payment_link" && source !== "embed") || !businessId) return
      await dispatchMerchantWebhook(admin, {
        businessId,
        event: "checkout.failed",
        data: {
          amount_cents: pi.amount,
          currency: String(pi.currency || "usd").toUpperCase(),
          reason: pi.last_payment_error?.message ?? null,
          ...(pi.metadata?.easner_payment_link_id
            ? { payment_link_id: String(pi.metadata.easner_payment_link_id) }
            : {}),
        },
      })
      if (settlementId && source === "embed") {
        trackServerEmbedPayerPaymentFailed({
          channel: "embed",
          businessId,
          settlementId,
          currency: String(pi.currency || "usd").toUpperCase(),
          amountCents: pi.amount,
          paymentLinkId: pi.metadata?.easner_payment_link_id
            ? String(pi.metadata.easner_payment_link_id)
            : null,
          reason: pi.last_payment_error?.message ?? null,
          livemode: event.livemode !== false,
          stripeEventId: event.id,
        })
      }
      return
    }
    case "invoice.paid":
    case "invoice.payment_failed":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await handleSubscriptionLifecycleEvent(admin, event)
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
      // Keep the phase – ops handles clawback – but record the event on the settlement.
      await appendSettlementEvent(admin, settlement, event.id)
      // Tag invoice metadata for ops visibility
      if (settlement.invoiceId) {
        const { data: inv } = await admin
          .from("invoices")
          .select("metadata")
          .eq("id", settlement.invoiceId)
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
          await admin.from("invoices").update({ metadata: meta }).eq("id", settlement.invoiceId)
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
      const refundedAt = new Date((event.created || 0) * 1000).toISOString()
      const result = await applyInvoiceStripeRefundSideEffects(admin, {
        chargeId: charge.id,
        refundId,
        refundedAt,
        source: "webhook",
        stripeEventId: event.id,
      })
      if (result.ok && result.skipped === "not_found") {
        await applyCheckoutStripeRefund(admin, {
          chargeId: charge.id,
          refundId,
          refundedAt,
          stripeEventId: event.id,
        })
        return
      }
      if (result.ok && result.skipped === "credited") {
        console.warn(
          "[stripe] refund after credited – manual clawback required",
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
      const refundedAt = new Date((event.created || 0) * 1000).toISOString()
      const result = await applyInvoiceStripeRefundSideEffects(admin, {
        chargeId,
        refundId: refund.id,
        refundedAt,
        source: "webhook",
        stripeEventId: event.id,
      })
      if (result.ok && result.skipped === "not_found") {
        await applyCheckoutStripeRefund(admin, {
          chargeId,
          refundId: refund.id,
          refundedAt,
          stripeEventId: event.id,
        })
        return
      }
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
        await appendSettlementEvent(admin, settlement, event.id, {
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
        await appendSettlementEvent(admin, settlement, event.id)
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
      if (
        event.type.includes("onramp") ||
        (event.data?.object &&
          typeof event.data.object === "object" &&
          String((event.data.object as { object?: string }).object || "").includes("onramp"))
      ) {
        const { creditOnrampSessionIfFulfilled } = await import("./onramp-ledger")
        await creditOnrampSessionIfFulfilled(admin, {
          stripeSession: event.data.object as unknown as Record<string, unknown>,
        })
      }
      return
  }
}

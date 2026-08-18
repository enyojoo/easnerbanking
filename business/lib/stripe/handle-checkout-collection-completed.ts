import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { dispatchMerchantWebhook } from "@/lib/checkout/merchant-webhooks"
import { getStripe } from "./client"
import { resolveFeeAndTransfer } from "./resolve-charge-settlement"

export type CheckoutCollectionSource = "payment_link" | "embed"

type Input = {
  source: CheckoutCollectionSource
  settlementId: string
  businessId: string
  paymentIntentId: string
  sessionId: string | null
  subscriptionId: string | null
  amountTotal: number
  currency: string
  customerEmail: string | null
  customerName: string | null
  sessionPaymentMethodTypes: string[] | null
  paymentLinkId: string | null
}

function headlineFor(source: CheckoutCollectionSource, linkLabel: string | null): string {
  if (source === "embed") return "Online payment"
  return linkLabel ? `Payment link — ${linkLabel}` : "Payment link payment"
}

/**
 * Settle a Payment Link or website-embed collection: complete the session row,
 * record the settlement, credit the ledger with `source: checkout_stripe`, and
 * notify the merchant webhook. Mirrors the invoice settlement phases
 * (payment_received → payout_sent → credited).
 */
export async function handleCheckoutCollectionCompleted(
  admin: SupabaseClient,
  event: Stripe.Event,
  input: Input,
): Promise<{ handled: boolean }> {
  if (!input.settlementId || !input.businessId || !input.paymentIntentId) {
    return { handled: false }
  }

  const { feeCents, chargeId, paymentMethodType, paymentMethod, transferId, connectedAccountId } =
    await resolveFeeAndTransfer(getStripe(), input.paymentIntentId, {
      sessionPaymentMethodTypes: input.sessionPaymentMethodTypes,
    })

  const { data: existing } = await admin
    .from("checkout_stripe_settlements")
    .select("id, phase")
    .eq("stripe_payment_intent_id", input.paymentIntentId)
    .maybeSingle()
  if (existing?.id && existing.phase !== "failed") {
    return { handled: true }
  }

  const grossCents = input.amountTotal
  const netCents = Math.max(0, grossCents - feeCents)
  const paidAt = new Date().toISOString()
  const currency = input.currency.toUpperCase()

  const sessionMatch = input.sessionId
    ? { column: "stripe_checkout_session_id", value: input.sessionId }
    : { column: "easner_settlement_id", value: input.settlementId }

  const { data: sessionRows } = await admin
    .from("online_checkout_sessions")
    .update({
      status: "complete",
      stripe_payment_intent_id: input.paymentIntentId,
      ...(input.subscriptionId ? { stripe_subscription_id: input.subscriptionId } : {}),
      gross_cents: grossCents,
      fee_cents: feeCents,
      net_cents: netCents,
      payment_method_type: paymentMethodType,
      ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
      ...(connectedAccountId ? { stripe_connected_account_id: connectedAccountId } : {}),
      completed_at: paidAt,
      updated_at: paidAt,
    })
    .eq(sessionMatch.column, sessionMatch.value)
    .select("id, payment_link_id")

  const sessionRow = sessionRows?.[0] ?? null
  const paymentLinkId =
    input.paymentLinkId ||
    (sessionRow?.payment_link_id ? String(sessionRow.payment_link_id) : null)

  let linkLabel: string | null = null
  if (paymentLinkId) {
    const { data: link } = await admin
      .from("payment_links")
      .select("label, payment_count")
      .eq("id", paymentLinkId)
      .maybeSingle()
    linkLabel = typeof link?.label === "string" ? link.label : null
    await admin
      .from("payment_links")
      .update({
        payment_count: Number(link?.payment_count ?? 0) + 1,
        updated_at: paidAt,
      })
      .eq("id", paymentLinkId)
  }

  const ownerUserId = await resolveOrgOwnerUserId(admin, input.businessId, "")
  if (!ownerUserId) {
    throw new Error(`No org owner for business ${input.businessId}`)
  }

  const headline = headlineFor(input.source, linkLabel)
  const ledger = await upsertLedgerTransaction(admin, {
    userId: ownerUserId,
    businessId: input.businessId,
    provider: "stripe",
    providerTransactionId: input.paymentIntentId,
    providerEventId: event.id,
    status: "processing",
    amount: netCents / 100,
    currency,
    direction: "in",
    occurredAt: paidAt,
    metadata: {
      source: "checkout_stripe",
      collection_source: input.source,
      ...(paymentLinkId ? { payment_link_id: paymentLinkId } : {}),
      ...(linkLabel ? { payment_link_label: linkLabel } : {}),
      easner_settlement_id: input.settlementId,
      stripe_payment_intent_id: input.paymentIntentId,
      stripe_charge_id: chargeId,
      ...(input.subscriptionId ? { stripe_subscription_id: input.subscriptionId } : {}),
      settlement_phase: "payment_received",
      payment_received_at: paidAt,
      gross_cents: grossCents,
      fee_cents: feeCents,
      net_cents: netCents,
      payment_method_type: paymentMethodType,
      ...(paymentMethod ? { payment_method: paymentMethod } : {}),
      ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
      ...(input.customerName ? { customer_name: input.customerName } : {}),
      stripe_connected_account_id: connectedAccountId,
      stripe_transfer_id: transferId,
      headline,
    },
    baseCurrency: currency === "EUR" ? "EUR" : "USD",
  })

  await admin.from("checkout_stripe_settlements").upsert(
    {
      id: input.settlementId,
      business_id: input.businessId,
      checkout_session_id: sessionRow?.id ? String(sessionRow.id) : null,
      payment_link_id: paymentLinkId,
      source: input.source,
      stripe_payment_intent_id: input.paymentIntentId,
      stripe_charge_id: chargeId,
      stripe_connected_account_id: connectedAccountId,
      stripe_transfer_id: transferId,
      stripe_subscription_id: input.subscriptionId,
      gross_cents: grossCents,
      fee_cents: feeCents,
      net_cents: netCents,
      currency,
      phase: "payment_received",
      ledger_transaction_id: ledger.transactionId,
      stripe_event_ids: [event.id],
      created_at: paidAt,
      updated_at: paidAt,
    },
    { onConflict: "id" },
  )

  await dispatchMerchantWebhook(admin, {
    businessId: input.businessId,
    event: "checkout.completed",
    data: {
      checkout_session_id: input.sessionId,
      amount_cents: grossCents,
      currency,
      ...(paymentLinkId ? { payment_link_id: paymentLinkId } : {}),
      ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
      paid_at: paidAt,
    },
  })

  return { handled: true }
}

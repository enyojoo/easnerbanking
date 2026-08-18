import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { dispatchMerchantWebhook } from "@/lib/checkout/merchant-webhooks"
import { deliverCheckoutPayerReceiptEmail } from "@/lib/checkout/deliver-checkout-payer-receipt-email"
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

function receiptDescription(source: CheckoutCollectionSource, linkLabel: string | null): string {
  if (source === "embed") return "Online payment"
  return linkLabel?.trim() || "Online payment"
}

function asMetadata(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) }
  }
  return {}
}

async function sendPayerReceiptIfNeeded(
  admin: SupabaseClient,
  input: {
    sessionRowId: string | null
    metadata: unknown
    businessId: string
    to: string | null
    customerName: string | null
    amountCents: number
    currency: string
    description: string
    paidAt: string
  },
): Promise<void> {
  const to = input.to?.trim() || ""
  if (!to) return
  const metadata = asMetadata(input.metadata)
  if (typeof metadata.payer_receipt_sent_at === "string" && metadata.payer_receipt_sent_at.trim()) {
    return
  }
  try {
    const result = await deliverCheckoutPayerReceiptEmail(admin, {
      businessId: input.businessId,
      to,
      customerName: input.customerName,
      amountCents: input.amountCents,
      currency: input.currency,
      description: input.description,
      paidAt: input.paidAt,
    })
    if (!result.ok) {
      console.error("Checkout payer receipt failed:", result.error)
      return
    }
    if (!input.sessionRowId) return
    await admin
      .from("online_checkout_sessions")
      .update({
        metadata: { ...metadata, payer_receipt_sent_at: input.paidAt },
        updated_at: input.paidAt,
      })
      .eq("id", input.sessionRowId)
  } catch (err) {
    console.error("Checkout payer receipt failed:", err)
  }
}

/**
 * Settle a Payment Link or website-embed collection: complete the session row,
 * record the settlement, credit the ledger with `source: checkout_stripe`, and
 * notify the merchant webhook. Stripe test events (`livemode: false`) complete
 * the session and fire the merchant webhook, but skip the live ledger.
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
    if (event.livemode !== false) {
      const { data: priorSession } = await admin
        .from("online_checkout_sessions")
        .select("id, metadata, customer_email, payment_link_id")
        .eq(input.sessionId ? "stripe_checkout_session_id" : "easner_settlement_id", input.sessionId || input.settlementId)
        .maybeSingle()
      let retryLabel: string | null = null
      const retryLinkId =
        input.paymentLinkId ||
        (priorSession?.payment_link_id ? String(priorSession.payment_link_id) : null)
      if (retryLinkId) {
        const { data: link } = await admin
          .from("payment_links")
          .select("label")
          .eq("id", retryLinkId)
          .maybeSingle()
        retryLabel = typeof link?.label === "string" ? link.label : null
      }
      await sendPayerReceiptIfNeeded(admin, {
        sessionRowId: priorSession?.id ? String(priorSession.id) : null,
        metadata: priorSession?.metadata,
        businessId: input.businessId,
        to: input.customerEmail || (typeof priorSession?.customer_email === "string" ? priorSession.customer_email : null),
        customerName: input.customerName,
        amountCents: input.amountTotal,
        currency: input.currency.toUpperCase(),
        description: receiptDescription(input.source, retryLabel),
        paidAt: new Date().toISOString(),
      })
    }
    return { handled: true }
  }

  const grossCents = input.amountTotal
  const netCents = Math.max(0, grossCents - feeCents)
  const paidAt = new Date().toISOString()
  const currency = input.currency.toUpperCase()

  const sessionMatch = input.sessionId
    ? { column: "stripe_checkout_session_id", value: input.sessionId }
    : { column: "easner_settlement_id", value: input.settlementId }

  const isStripeTest = event.livemode === false

  if (isStripeTest) {
    const { data: prior } = await admin
      .from("online_checkout_sessions")
      .select("id, status")
      .eq(sessionMatch.column, sessionMatch.value)
      .maybeSingle()
    if (prior?.status === "complete") {
      return { handled: true }
    }
  }

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
      ...(typeof event.livemode === "boolean" ? { livemode: event.livemode } : {}),
      completed_at: paidAt,
      updated_at: paidAt,
    })
    .eq(sessionMatch.column, sessionMatch.value)
    .select("id, payment_link_id, metadata, customer_email")

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
    if (!isStripeTest) {
      await admin
        .from("payment_links")
        .update({
          payment_count: Number(link?.payment_count ?? 0) + 1,
          updated_at: paidAt,
        })
        .eq("id", paymentLinkId)
    }
  }

  const webhookPayload = {
    businessId: input.businessId,
    event: "checkout.completed" as const,
    data: {
      checkout_session_id: input.sessionId,
      amount_cents: grossCents,
      currency,
      ...(paymentLinkId ? { payment_link_id: paymentLinkId } : {}),
      ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
      paid_at: paidAt,
      livemode: !isStripeTest,
    },
  }

  if (isStripeTest) {
    if (input.source === "embed") {
      await admin
        .from("business_checkout_settings")
        .update({ test_payment_completed_at: paidAt, updated_at: paidAt })
        .eq("business_id", input.businessId)
    }
    await dispatchMerchantWebhook(admin, webhookPayload)
    return { handled: true }
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

  await dispatchMerchantWebhook(admin, webhookPayload)

  await sendPayerReceiptIfNeeded(admin, {
    sessionRowId: sessionRow?.id ? String(sessionRow.id) : null,
    metadata: sessionRow && "metadata" in sessionRow ? sessionRow.metadata : null,
    businessId: input.businessId,
    to:
      input.customerEmail ||
      (sessionRow && typeof sessionRow.customer_email === "string" ? sessionRow.customer_email : null),
    customerName: input.customerName,
    amountCents: grossCents,
    currency,
    description: receiptDescription(input.source, linkLabel),
    paidAt,
  })

  return { handled: true }
}

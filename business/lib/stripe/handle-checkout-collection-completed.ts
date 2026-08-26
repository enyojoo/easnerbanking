import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { dispatchMerchantWebhook } from "@/lib/checkout/merchant-webhooks"
import { checkoutCompletedWebhookData } from "@/lib/checkout/merchant-webhook-payload"
import { deliverCheckoutPayerReceiptEmail } from "@/lib/checkout/deliver-checkout-payer-receipt-email"
import {
  trackServerCheckoutCompleted,
  trackServerEmbedPayerPaymentSucceeded,
} from "@/lib/server-analytics"
import type { StripePaymentMethodDisplay } from "@/lib/stripe/parse-payment-method-display"
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
  return linkLabel ? `Payment link – ${linkLabel}` : "Payment link payment"
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

function hasReceiptClaim(metadata: Record<string, unknown>): boolean {
  const sent = metadata.payer_receipt_sent_at
  const claimed = metadata.payer_receipt_claimed_at
  return (
    (typeof sent === "string" && sent.trim().length > 0) ||
    (typeof claimed === "string" && claimed.trim().length > 0)
  )
}

async function patchLedgerPayerIdentity(
  admin: SupabaseClient,
  ledgerTransactionId: string | null | undefined,
  identity: { email: string | null; name: string | null },
): Promise<void> {
  const email = identity.email?.trim() || ""
  const name = identity.name?.trim() || ""
  if (!ledgerTransactionId || (!email && !name)) return

  const { data: row } = await admin
    .from("transactions")
    .select("metadata")
    .eq("id", ledgerTransactionId)
    .maybeSingle()
  if (!row?.metadata || typeof row.metadata !== "object") return

  const meta = asMetadata(row.metadata)
  let changed = false
  if (email && !String(meta.customer_email ?? "").trim()) {
    meta.customer_email = email
    changed = true
  }
  if (name && !String(meta.customer_name ?? "").trim()) {
    meta.customer_name = name
    changed = true
  }
  if (!changed) return

  await admin.from("transactions").update({ metadata: meta }).eq("id", ledgerTransactionId)
}

/**
 * Easner receipts send only on `checkout.session.completed`. The same
 * settlement also arrives as `payment_intent.succeeded`; sending on both
 * duplicated mail before `payer_receipt_sent_at` was written.
 */
async function sendPayerReceiptIfNeeded(
  admin: SupabaseClient,
  event: Stripe.Event,
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
    paymentMethod: StripePaymentMethodDisplay | null
  },
): Promise<void> {
  if (event.type !== "checkout.session.completed") return
  const to = input.to?.trim() || ""
  if (!to) return
  const metadata = asMetadata(input.metadata)
  if (hasReceiptClaim(metadata)) return

  if (input.sessionRowId) {
    const claimedAt = new Date().toISOString()
    const { error } = await admin
      .from("online_checkout_sessions")
      .update({
        metadata: { ...metadata, payer_receipt_claimed_at: claimedAt },
        updated_at: claimedAt,
      })
      .eq("id", input.sessionRowId)
    if (error) {
      console.error("Checkout payer receipt claim failed:", error)
      return
    }
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
      paymentMethod: input.paymentMethod,
    })
    if (!result.ok) {
      console.error("Checkout payer receipt failed:", result.error)
      return
    }
    if (!input.sessionRowId) return
    await admin
      .from("online_checkout_sessions")
      .update({
        metadata: {
          ...metadata,
          payer_receipt_claimed_at: metadata.payer_receipt_claimed_at ?? input.paidAt,
          payer_receipt_sent_at: input.paidAt,
        },
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

  const {
    feeCents,
    applicationFeeCents,
    chargeId,
    chargedAt,
    paymentMethodType,
    paymentMethod,
    transferId,
    connectedAccountId,
    payerEmail,
    payerName,
  } = await resolveFeeAndTransfer(getStripe(event.livemode !== false), input.paymentIntentId, {
    sessionPaymentMethodTypes: input.sessionPaymentMethodTypes,
  })

  const customerEmail = input.customerEmail?.trim() || payerEmail
  const customerName = input.customerName?.trim() || payerName
  /** Merchant net uses Connect application fee, not Stripe's platform processing fee. */
  const merchantFeeCents = applicationFeeCents != null ? applicationFeeCents : feeCents

  const paidAt =
    chargedAt ||
    (typeof event.created === "number" ? new Date(event.created * 1000).toISOString() : new Date().toISOString())

  const { data: existing } = await admin
    .from("checkout_stripe_settlements")
    .select("id, phase, ledger_transaction_id")
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
      const to =
        customerEmail ||
        (typeof priorSession?.customer_email === "string" ? priorSession.customer_email : null)
      await patchLedgerPayerIdentity(admin, existing.ledger_transaction_id, {
        email: to,
        name: customerName,
      })
      if (priorSession?.id && to && !String(priorSession.customer_email ?? "").trim()) {
        await admin
          .from("online_checkout_sessions")
          .update({ customer_email: to, updated_at: paidAt })
          .eq("id", priorSession.id)
      }
      await sendPayerReceiptIfNeeded(admin, event, {
        sessionRowId: priorSession?.id ? String(priorSession.id) : null,
        metadata: priorSession?.metadata,
        businessId: input.businessId,
        to,
        customerName,
        amountCents: input.amountTotal,
        currency: input.currency.toUpperCase(),
        description: receiptDescription(input.source, retryLabel),
        paidAt,
        paymentMethod,
      })
    }
    return { handled: true }
  }

  const grossCents = input.amountTotal
  const netCents = Math.max(0, grossCents - merchantFeeCents)
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
      fee_cents: merchantFeeCents,
      net_cents: netCents,
      payment_method_type: paymentMethodType,
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      ...(connectedAccountId ? { stripe_connected_account_id: connectedAccountId } : {}),
      ...(typeof event.livemode === "boolean" ? { livemode: event.livemode } : {}),
      completed_at: paidAt,
      updated_at: paidAt,
    })
    .eq(sessionMatch.column, sessionMatch.value)
    .select("id, payment_link_id, metadata, customer_email, mode, stripe_subscription_id")

  const sessionRow = sessionRows?.[0] ?? null
  const paymentLinkId =
    input.paymentLinkId ||
    (sessionRow?.payment_link_id ? String(sessionRow.payment_link_id) : null)

  let linkLabel: string | null = null
  if (paymentLinkId) {
    const { data: link } = await admin
      .from("payment_links")
      .select("label")
      .eq("id", paymentLinkId)
      .maybeSingle()
    linkLabel = typeof link?.label === "string" ? link.label : null
    if (!isStripeTest) {
      await admin.rpc("increment_payment_link_payment_count", {
        p_link_id: paymentLinkId,
        p_updated_at: paidAt,
      })
    }
  }

  const sessionMetadata =
    sessionRow && "metadata" in sessionRow ? asMetadata(sessionRow.metadata) : {}
  const webhookPayload = {
    businessId: input.businessId,
    event: "checkout.completed" as const,
    data: checkoutCompletedWebhookData({
      checkoutSessionId: input.sessionId,
      mode:
        sessionRow && "mode" in sessionRow && typeof sessionRow.mode === "string"
          ? sessionRow.mode
          : input.subscriptionId
            ? "subscription"
            : "payment",
      amountCents: grossCents,
      currency,
      customerEmail:
        customerEmail ||
        (sessionRow && typeof sessionRow.customer_email === "string"
          ? sessionRow.customer_email
          : null),
      subscriptionId:
        input.subscriptionId ||
        (sessionRow &&
        "stripe_subscription_id" in sessionRow &&
        typeof sessionRow.stripe_subscription_id === "string"
          ? sessionRow.stripe_subscription_id
          : null),
      metadata: sessionMetadata,
      paymentLinkId,
      paidAt,
      livemode: !isStripeTest,
    }),
  }

  if (isStripeTest) {
    if (input.source === "embed") {
      await admin
        .from("business_checkout_settings")
        .update({ test_payment_completed_at: paidAt, updated_at: paidAt })
        .eq("business_id", input.businessId)
    }
    await dispatchMerchantWebhook(admin, webhookPayload)
    trackServerCheckoutCompleted({
      channel: input.source,
      businessId: input.businessId,
      settlementId: input.settlementId,
      currency,
      amountCents: grossCents,
      paymentLinkId,
      livemode: false,
      stripeEventId: event.id,
    })
    trackServerEmbedPayerPaymentSucceeded({
      channel: input.source,
      businessId: input.businessId,
      settlementId: input.settlementId,
      currency,
      amountCents: grossCents,
      paymentLinkId,
      livemode: false,
      stripeEventId: event.id,
    })
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
      fee_cents: merchantFeeCents,
      net_cents: netCents,
      payment_method_type: paymentMethodType,
      ...(paymentMethod ? { payment_method: paymentMethod } : {}),
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      ...(customerName ? { customer_name: customerName } : {}),
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
      fee_cents: merchantFeeCents,
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

  await sendPayerReceiptIfNeeded(admin, event, {
    sessionRowId: sessionRow?.id ? String(sessionRow.id) : null,
    metadata: sessionRow && "metadata" in sessionRow ? sessionRow.metadata : null,
    businessId: input.businessId,
    to:
      customerEmail ||
      (sessionRow && typeof sessionRow.customer_email === "string" ? sessionRow.customer_email : null),
    customerName,
    amountCents: grossCents,
    currency,
    description: receiptDescription(input.source, linkLabel),
    paidAt,
    paymentMethod,
  })

  trackServerCheckoutCompleted({
    channel: input.source,
    businessId: input.businessId,
    settlementId: input.settlementId,
    currency,
    amountCents: grossCents,
    paymentLinkId,
    livemode: !isStripeTest,
    stripeEventId: event.id,
  })
  trackServerEmbedPayerPaymentSucceeded({
    channel: input.source,
    businessId: input.businessId,
    settlementId: input.settlementId,
    currency,
    amountCents: grossCents,
    paymentLinkId,
    livemode: !isStripeTest,
    stripeEventId: event.id,
  })

  return { handled: true }
}

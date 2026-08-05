import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { markInvoicePaidStripe } from "@/lib/invoices/mark-invoice-paid-stripe"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { getStripe } from "./client"
import { parsePaymentMethodDisplayFromCharge } from "@/lib/stripe/parse-payment-method-display"
import type { StripePaymentMethodDisplay } from "@/lib/stripe/parse-payment-method-display"

function asCents(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n)
  return Number.isFinite(v) ? Math.round(v) : 0
}

async function resolveFeeAndTransfer(
  stripe: Stripe,
  paymentIntentId: string,
): Promise<{
  feeCents: number
  chargeId: string | null
  paymentMethodType: string | null
  paymentMethod: StripePaymentMethodDisplay | null
  transferId: string | null
  connectedAccountId: string | null
}> {
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction", "latest_charge.transfer"],
    })
    const charge =
      typeof pi.latest_charge === "object" && pi.latest_charge
        ? pi.latest_charge
        : null
    const chargeId = charge?.id ?? (typeof pi.latest_charge === "string" ? pi.latest_charge : null)
    const bt =
      charge && typeof charge.balance_transaction === "object" && charge.balance_transaction
        ? charge.balance_transaction
        : null
    const feeCents = bt && typeof bt.fee === "number" ? bt.fee : 0
    const paymentMethod = parsePaymentMethodDisplayFromCharge(charge)
    const paymentMethodType =
      paymentMethod?.type ??
      (charge && typeof charge.payment_method_details?.type === "string"
        ? charge.payment_method_details.type
        : null)

    let transferId: string | null = null
    if (charge && typeof charge.transfer === "string") {
      transferId = charge.transfer
    } else if (charge && typeof charge.transfer === "object" && charge.transfer) {
      transferId = charge.transfer.id
    }

    const connectedFromPi =
      typeof pi.transfer_data?.destination === "string"
        ? pi.transfer_data.destination
        : pi.transfer_data?.destination && typeof pi.transfer_data.destination === "object"
          ? pi.transfer_data.destination.id
          : null

    const connectedFromMeta = String(pi.metadata?.easner_stripe_connected_account_id ?? "").trim() || null

    return {
      feeCents,
      chargeId,
      paymentMethodType,
      paymentMethod,
      transferId,
      connectedAccountId: connectedFromPi || connectedFromMeta,
    }
  } catch (e) {
    console.warn("[stripe] fee resolve failed:", e)
    return {
      feeCents: 0,
      chargeId: null,
      paymentMethodType: null,
      paymentMethod: null,
      transferId: null,
      connectedAccountId: null,
    }
  }
}

/**
 * Hop 1: checkout.session.completed / payment_intent.succeeded → invoice paid + settlement + ledger.
 */
export async function handleStripeCheckoutCompleted(
  admin: SupabaseClient,
  event: Stripe.Event,
): Promise<{ handled: boolean }> {
  const stripe = getStripe()
  let paymentIntentId = ""
  let sessionId: string | null = null
  let metadata: Record<string, string> = {}
  let amountTotal = 0
  let currency = "USD"
  let customerEmail: string | null = null
  let customerName: string | null = null

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session
    sessionId = session.id
    paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? ""
    metadata = (session.metadata ?? {}) as Record<string, string>
    amountTotal = asCents(session.amount_total)
    currency = String(session.currency || "usd").toUpperCase()
    customerEmail =
      session.customer_details?.email ||
      (typeof session.customer_email === "string" ? session.customer_email : null)
    customerName =
      typeof session.customer_details?.name === "string" && session.customer_details.name.trim()
        ? session.customer_details.name.trim()
        : null
  } else if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent
    paymentIntentId = pi.id
    metadata = (pi.metadata ?? {}) as Record<string, string>
    amountTotal = asCents(pi.amount_received || pi.amount)
    currency = String(pi.currency || "usd").toUpperCase()
    if (typeof pi.receipt_email === "string" && pi.receipt_email.trim()) {
      customerEmail = pi.receipt_email.trim()
    }
  } else {
    return { handled: false }
  }

  const settlementId = String(metadata.easner_settlement_id ?? "").trim()
  const invoiceId = String(metadata.easner_invoice_id ?? "").trim()
  const businessId = String(metadata.easner_business_id ?? "").trim()
  const invoiceNumber = String(metadata.easner_invoice_number ?? "").trim()

  if (!settlementId || !invoiceId || !businessId || !paymentIntentId) {
    // Not an Easner invoice payment
    return { handled: false }
  }

  // Idempotent: settlement already exists for this PI
  const { data: existingSettlement } = await admin
    .from("invoice_stripe_settlements")
    .select("id, phase, ledger_transaction_id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle()

  if (existingSettlement?.id && existingSettlement.phase !== "failed") {
    return { handled: true }
  }

  const { feeCents, chargeId, paymentMethodType, paymentMethod, transferId, connectedAccountId } =
    await resolveFeeAndTransfer(stripe, paymentIntentId)

  const connectedFromMeta = String(metadata.easner_stripe_connected_account_id ?? "").trim() || null
  let stripeConnectedAccountId = connectedAccountId || connectedFromMeta

  if (!stripeConnectedAccountId) {
    const { data: sessionRow } = await admin
      .from("invoice_checkout_sessions")
      .select("stripe_connected_account_id")
      .eq("easner_settlement_id", settlementId)
      .maybeSingle()
    if (typeof sessionRow?.stripe_connected_account_id === "string") {
      stripeConnectedAccountId = sessionRow.stripe_connected_account_id
    }
  }

  // Bill-to fallback for name/email from invoice row
  const { data: invoiceRow } = await admin
    .from("invoices")
    .select("customer_name, customer_email")
    .eq("id", invoiceId)
    .eq("business_id", businessId)
    .maybeSingle()

  const billToName =
    typeof invoiceRow?.customer_name === "string" && invoiceRow.customer_name.trim()
      ? invoiceRow.customer_name.trim()
      : null
  const billToEmail =
    typeof invoiceRow?.customer_email === "string" && invoiceRow.customer_email.trim()
      ? invoiceRow.customer_email.trim()
      : null

  const resolvedCustomerName = customerName || billToName
  const resolvedCustomerEmail = customerEmail || billToEmail

  const grossCents = amountTotal
  const netCents = Math.max(0, grossCents - feeCents)
  const paidAt = new Date().toISOString()

  // Update checkout session row
  if (sessionId) {
    await admin
      .from("invoice_checkout_sessions")
      .update({
        status: "complete",
        stripe_payment_intent_id: paymentIntentId,
        gross_cents: grossCents,
        fee_cents: feeCents,
        net_cents: netCents,
        payment_method_type: paymentMethodType,
        customer_email: resolvedCustomerEmail,
        completed_at: paidAt,
        ...(stripeConnectedAccountId
          ? { stripe_connected_account_id: stripeConnectedAccountId }
          : {}),
      })
      .eq("stripe_checkout_session_id", sessionId)
  } else {
    await admin
      .from("invoice_checkout_sessions")
      .update({
        status: "complete",
        stripe_payment_intent_id: paymentIntentId,
        gross_cents: grossCents,
        fee_cents: feeCents,
        net_cents: netCents,
        payment_method_type: paymentMethodType,
        ...(resolvedCustomerEmail ? { customer_email: resolvedCustomerEmail } : {}),
        completed_at: paidAt,
        ...(stripeConnectedAccountId
          ? { stripe_connected_account_id: stripeConnectedAccountId }
          : {}),
      })
      .eq("easner_settlement_id", settlementId)
  }

  const { invoice } = await markInvoicePaidStripe(admin, {
    invoiceId,
    businessId,
    paymentInfo: {
      paidAt,
      paymentIntentId,
      chargeId: chargeId ?? undefined,
      paymentMethodType: paymentMethodType ?? undefined,
      brand: paymentMethod?.brand,
      last4: paymentMethod?.last4,
      wallet: paymentMethod?.wallet,
      bankName: paymentMethod?.bankName,
      customerEmail: resolvedCustomerEmail ?? undefined,
      customerName: resolvedCustomerName ?? undefined,
      grossCents,
      feeCents,
      netCents,
      settlementPhase: "payment_received",
    },
  })

  const ownerUserId = await resolveOrgOwnerUserId(admin, businessId, "")
  if (!ownerUserId) {
    throw new Error(`No org owner for business ${businessId}`)
  }

  const ledger = await upsertLedgerTransaction(admin, {
    userId: ownerUserId,
    businessId,
    provider: "stripe",
    providerTransactionId: paymentIntentId,
    providerEventId: event.id,
    status: "processing",
    amount: netCents / 100,
    currency,
    direction: "in",
    occurredAt: paidAt,
    metadata: {
      source: "invoice_stripe",
      invoice_id: invoiceId,
      invoice_number: invoiceNumber || invoice.invoiceNumber,
      easner_settlement_id: settlementId,
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id: chargeId,
      settlement_phase: "payment_received",
      payment_received_at: paidAt,
      gross_cents: grossCents,
      fee_cents: feeCents,
      net_cents: netCents,
      payment_method_type: paymentMethodType,
      ...(paymentMethod ? { payment_method: paymentMethod } : {}),
      ...(resolvedCustomerEmail ? { customer_email: resolvedCustomerEmail } : {}),
      ...(resolvedCustomerName ? { customer_name: resolvedCustomerName } : {}),
      stripe_connected_account_id: stripeConnectedAccountId,
      stripe_transfer_id: transferId,
      headline: `Invoice #${invoiceNumber || invoice.invoiceNumber} payment`,
    },
    baseCurrency: currency === "EUR" ? "EUR" : "USD",
  })

  const eventIds = [event.id]
  await admin.from("invoice_stripe_settlements").upsert(
    {
      id: settlementId,
      invoice_id: invoiceId,
      business_id: businessId,
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id: chargeId,
      stripe_connected_account_id: stripeConnectedAccountId,
      stripe_transfer_id: transferId,
      gross_cents: grossCents,
      fee_cents: feeCents,
      net_cents: netCents,
      currency,
      phase: "payment_received",
      ledger_transaction_id: ledger.transactionId,
      stripe_event_ids: eventIds,
      updated_at: paidAt,
      created_at: paidAt,
    },
    { onConflict: "id" },
  )

  return { handled: true }
}

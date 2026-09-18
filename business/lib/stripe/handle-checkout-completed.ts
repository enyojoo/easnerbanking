import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { markInvoicePaidStripe } from "@/lib/invoices/mark-invoice-paid-stripe"
import { resolveOrgOwnerUserId } from "@/lib/business/org-owner"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { getStripe } from "./client"
import { stripeEventConnectedAccount } from "./connect-request"
import type { StripePaymentMethodDisplay } from "@/lib/stripe/parse-payment-method-display"
import { parsePaymentMethodDisplayFromCharge } from "@/lib/stripe/parse-payment-method-display"
import { patchInvoiceStripeLedgerTransactionId } from "@/lib/invoices/patch-invoice-stripe-ledger-transaction-id"
import { needsPaymentMethodHeal } from "@/lib/stripe/heal-invoice-payment-metadata"
import {
  parseCheckoutSessionMetadata,
  settlesAsCollection,
} from "./checkout-session-metadata"
import { handleCheckoutCollectionCompleted } from "./handle-checkout-collection-completed"
import { paymentMethodIsComplete, resolveFeeAndTransfer } from "./resolve-charge-settlement"
import {
  trackServerCheckoutCompleted,
  trackServerInvoicePaid,
} from "@/lib/server-analytics"

function asCents(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n)
  return Number.isFinite(v) ? Math.round(v) : 0
}

async function patchStripeInvoicePaymentMetadata(
  admin: SupabaseClient,
  input: {
    invoiceId: string
    businessId: string
    settlementId: string
    ledgerTransactionId: string | null
    paymentIntentId: string
    chargeId: string | null
    paymentMethodType: string | null
    paymentMethod: StripePaymentMethodDisplay | null
  },
): Promise<void> {
  if (!paymentMethodIsComplete(input.paymentMethod) && !input.paymentMethodType) return

  if (input.ledgerTransactionId) {
    const { data: ledgerRow } = await admin
      .from("transactions")
      .select("metadata")
      .eq("id", input.ledgerTransactionId)
      .maybeSingle()
    if (ledgerRow?.metadata && typeof ledgerRow.metadata === "object") {
      const meta = { ...(ledgerRow.metadata as Record<string, unknown>) }
      if (needsPaymentMethodHeal(meta)) {
        if (input.chargeId && !meta.stripe_charge_id) meta.stripe_charge_id = input.chargeId
        if (input.paymentMethod) meta.payment_method = input.paymentMethod
        if (input.paymentMethodType) meta.payment_method_type = input.paymentMethodType
        await admin.from("transactions").update({ metadata: meta }).eq("id", input.ledgerTransactionId)
      }
    }
  }

  if (input.paymentMethodType) {
    await admin
      .from("invoice_checkout_sessions")
      .update({ payment_method_type: input.paymentMethodType })
      .eq("easner_settlement_id", input.settlementId)
    await admin
      .from("online_checkout_sessions")
      .update({ payment_method_type: input.paymentMethodType })
      .eq("easner_settlement_id", input.settlementId)
  }

  const { data: inv } = await admin
    .from("invoices")
    .select("metadata, status")
    .eq("id", input.invoiceId)
    .eq("business_id", input.businessId)
    .maybeSingle()

  if (!inv?.metadata || typeof inv.metadata !== "object") return
  const invMeta = { ...(inv.metadata as Record<string, unknown>) }
  const paymentInfo = (invMeta.paymentInfo ?? {}) as Record<string, unknown>
  const stripeInfo = (paymentInfo.stripe ?? {}) as Record<string, unknown>
  const priorType =
    typeof stripeInfo.paymentMethodType === "string" ? stripeInfo.paymentMethodType : null
  const priorLast4 = typeof stripeInfo.last4 === "string" ? stripeInfo.last4 : null
  const priorBank = typeof stripeInfo.bankName === "string" ? stripeInfo.bankName : null

  const enriched =
    Boolean(input.paymentMethodType && input.paymentMethodType !== priorType) ||
    Boolean(input.paymentMethod?.last4 && input.paymentMethod.last4 !== priorLast4) ||
    Boolean(input.paymentMethod?.bankName && input.paymentMethod.bankName !== priorBank) ||
    Boolean(input.paymentMethod?.brand && input.paymentMethod.brand !== stripeInfo.brand)

  if (!enriched) return

  invMeta.paymentInfo = {
    ...paymentInfo,
    stripe: {
      ...stripeInfo,
      ...(input.chargeId ? { chargeId: input.chargeId } : {}),
      ...(input.paymentMethodType ? { paymentMethodType: input.paymentMethodType } : {}),
      ...(input.paymentMethod?.brand ? { brand: input.paymentMethod.brand } : {}),
      ...(input.paymentMethod?.last4 ? { last4: input.paymentMethod.last4 } : {}),
      ...(input.paymentMethod?.wallet !== undefined ? { wallet: input.paymentMethod.wallet } : {}),
      ...(input.paymentMethod?.bankName ? { bankName: input.paymentMethod.bankName } : {}),
    },
  }
  await admin.from("invoices").update({ metadata: invMeta }).eq("id", input.invoiceId)
}

/**
 * Hop 1: checkout.session.completed / payment_intent.succeeded → collection settled.
 * Invoice sources mark the invoice paid; Payment Links and website embeds settle
 * through {@link handleCheckoutCollectionCompleted}.
 */
export async function handleStripeCheckoutCompleted(
  admin: SupabaseClient,
  event: Stripe.Event,
): Promise<{ handled: boolean }> {
  const stripe = getStripe(event.livemode !== false)
  let paymentIntentId = ""
  let sessionId: string | null = null
  let metadata: Record<string, string> = {}
  let amountTotal = 0
  let currency = "USD"
  let customerEmail: string | null = null
  let customerName: string | null = null
  let sessionPaymentMethodTypes: string[] | null = null
  let subscriptionId: string | null = null

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
    sessionPaymentMethodTypes = Array.isArray(session.payment_method_types)
      ? session.payment_method_types.map(String)
      : null
    subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id ?? null
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

  const parsed = parseCheckoutSessionMetadata(metadata)
  const { settlementId, businessId } = parsed
  const stripeAccount =
    stripeEventConnectedAccount(event, parsed.connectedAccountId)
  const invoiceId = parsed.invoiceId ?? ""
  const invoiceNumber = parsed.invoiceNumber ?? ""

  if (settlesAsCollection(parsed.source)) {
    return handleCheckoutCollectionCompleted(admin, event, {
      source: parsed.source,
      settlementId,
      businessId,
      paymentIntentId,
      sessionId,
      subscriptionId,
      amountTotal,
      currency,
      customerEmail,
      customerName,
      sessionPaymentMethodTypes,
      paymentLinkId: parsed.paymentLinkId,
      stripeAccountId: stripeAccount,
    })
  }

  if (!settlementId || !invoiceId || !businessId || !paymentIntentId) {
    return { handled: false }
  }

  const { feeCents, chargeId, paymentMethodType, paymentMethod, transferId, connectedAccountId } =
    await resolveFeeAndTransfer(stripe, paymentIntentId, {
      sessionPaymentMethodTypes,
      stripeAccount,
    })

  // Idempotent: settlement already exists – enrich payment method on later webhooks.
  const { data: existingSettlement } = await admin
    .from("invoice_stripe_settlements")
    .select("id, phase, ledger_transaction_id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle()

  if (existingSettlement?.id && existingSettlement.phase !== "failed") {
    await patchStripeInvoicePaymentMetadata(admin, {
      invoiceId,
      businessId,
      settlementId: existingSettlement.id,
      ledgerTransactionId: existingSettlement.ledger_transaction_id
        ? String(existingSettlement.ledger_transaction_id)
        : null,
      paymentIntentId,
      chargeId,
      paymentMethodType,
      paymentMethod,
    })

    if (
      paymentMethodIsComplete(paymentMethod) ||
      (paymentMethodType && paymentMethodType !== "card")
    ) {
      await markInvoicePaidStripe(admin, {
        invoiceId,
        businessId,
        paymentInfo: {
          paidAt: new Date().toISOString(),
          paymentIntentId,
          chargeId: chargeId ?? undefined,
          paymentMethodType: paymentMethodType ?? undefined,
          brand: paymentMethod?.brand,
          last4: paymentMethod?.last4,
          wallet: paymentMethod?.wallet,
          bankName: paymentMethod?.bankName,
          grossCents: amountTotal,
          feeCents,
          netCents: Math.max(0, amountTotal - feeCents),
          settlementPhase: "payment_received",
        },
      })
    }

    return { handled: true }
  }

  let stripeConnectedAccountId = connectedAccountId || parsed.connectedAccountId

  if (!stripeConnectedAccountId) {
    const { data: sessionRow } = await admin
      .from("online_checkout_sessions")
      .select("stripe_connected_account_id")
      .eq("easner_settlement_id", settlementId)
      .maybeSingle()
    if (typeof sessionRow?.stripe_connected_account_id === "string") {
      stripeConnectedAccountId = sessionRow.stripe_connected_account_id
    }
  }
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

  const sessionCompletePatch = {
    status: "complete",
    stripe_payment_intent_id: paymentIntentId,
    gross_cents: grossCents,
    fee_cents: feeCents,
    net_cents: netCents,
    payment_method_type: paymentMethodType,
    completed_at: paidAt,
    ...(resolvedCustomerEmail ? { customer_email: resolvedCustomerEmail } : {}),
    ...(stripeConnectedAccountId
      ? { stripe_connected_account_id: stripeConnectedAccountId }
      : {}),
  }

  if (sessionId) {
    await admin
      .from("invoice_checkout_sessions")
      .update(sessionCompletePatch)
      .eq("stripe_checkout_session_id", sessionId)
    await admin
      .from("online_checkout_sessions")
      .update(sessionCompletePatch)
      .eq("stripe_checkout_session_id", sessionId)
  } else {
    await admin
      .from("invoice_checkout_sessions")
      .update(sessionCompletePatch)
      .eq("easner_settlement_id", settlementId)
    await admin
      .from("online_checkout_sessions")
      .update(sessionCompletePatch)
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
      fee_mode: parsed.feeMode,
      phase: "payment_received",
      ledger_transaction_id: ledger.transactionId,
      stripe_event_ids: eventIds,
      updated_at: paidAt,
      created_at: paidAt,
    },
    { onConflict: "id" },
  )

  await admin.from("checkout_stripe_settlements").upsert(
    {
      id: settlementId,
      business_id: businessId,
      invoice_id: invoiceId,
      source: "invoice",
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

  if (invoice.paymentInfo?.method === "stripe" && !invoice.paymentInfo.transactionId) {
    await patchInvoiceStripeLedgerTransactionId(admin, {
      invoiceId,
      businessId,
      ledgerTransactionId: ledger.transactionId,
    })
  }

  trackServerCheckoutCompleted({
    channel: "invoice",
    businessId,
    settlementId,
    currency,
    amountCents: grossCents,
    invoiceId,
    livemode: event.livemode !== false,
    stripeEventId: event.id,
  })
  trackServerInvoicePaid({
    businessId,
    settlementId,
    invoiceId,
    currency,
    amountCents: grossCents,
    livemode: event.livemode !== false,
    stripeEventId: event.id,
  })

  return { handled: true }
}

/** Enrich invoice + ledger payment method from a succeeded charge (async methods). */
export async function handleStripeChargeSucceededForInvoice(
  admin: SupabaseClient,
  charge: Stripe.Charge,
): Promise<void> {
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id ?? ""
  if (!paymentIntentId) return

  const { data: settlement } = await admin
    .from("invoice_stripe_settlements")
    .select("id, invoice_id, business_id, ledger_transaction_id, phase")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle()

  if (!settlement?.id || settlement.phase === "failed") return

  const paymentMethod = parsePaymentMethodDisplayFromCharge(charge)
  const paymentMethodType =
    paymentMethod?.type ??
    (typeof charge.payment_method_details?.type === "string"
      ? charge.payment_method_details.type
      : null)

  await patchStripeInvoicePaymentMetadata(admin, {
    invoiceId: String(settlement.invoice_id),
    businessId: String(settlement.business_id),
    settlementId: String(settlement.id),
    ledgerTransactionId: settlement.ledger_transaction_id
      ? String(settlement.ledger_transaction_id)
      : null,
    paymentIntentId,
    chargeId: charge.id,
    paymentMethodType,
    paymentMethod,
  })

  if (paymentMethodIsComplete(paymentMethod) || paymentMethodType) {
    await markInvoicePaidStripe(admin, {
      invoiceId: String(settlement.invoice_id),
      businessId: String(settlement.business_id),
      paymentInfo: {
        paidAt: new Date((charge.created || 0) * 1000).toISOString(),
        paymentIntentId,
        chargeId: charge.id,
        paymentMethodType: paymentMethodType ?? undefined,
        brand: paymentMethod?.brand,
        last4: paymentMethod?.last4,
        wallet: paymentMethod?.wallet,
        bankName: paymentMethod?.bankName,
        grossCents: charge.amount,
        feeCents: 0,
        netCents: charge.amount,
        settlementPhase: "payment_received",
      },
    })
  }
}

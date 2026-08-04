import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import { mapRowToInvoice } from "@/lib/b2b/map-invoice"
import { isBusinessTier1Complete } from "@/lib/compliance/business-tier1"
import { getStripe } from "./client"
import { getStripePublishableKey, isStripeInvoicePaymentsEnabled } from "./config"
import { stripeCheckoutIdempotencyKey } from "./idempotency"
import { buildStatementDescriptorSuffix } from "./statement-descriptor"

const PAYABLE = new Set(["open", "sent", "past_due"])

export type CreateInvoiceCheckoutResult =
  | {
      ok: true
      clientSecret: string
      publishableKey: string
      checkoutSessionId: string
      settlementId: string
    }
  | { ok: false; status: number; error: string }

/**
 * Create (or reuse open) Stripe Checkout Session for a public invoice Pay online flow.
 */
export async function createInvoiceCheckoutSession(
  admin: SupabaseClient,
  input: {
    businessId: string
    invoiceRow: B2bInvoiceRow
    businessName?: string | null
    /** Public easetag for return_url after redirect-based payment methods. */
    easetag?: string | null
  },
): Promise<CreateInvoiceCheckoutResult> {
  if (!isStripeInvoicePaymentsEnabled()) {
    return { ok: false, status: 503, error: "Stripe invoice payments are not enabled" }
  }

  const invoice = mapRowToInvoice(input.invoiceRow)
  if (!PAYABLE.has(invoice.status)) {
    return { ok: false, status: 400, error: "Invoice is not payable" }
  }

  const amountCents = Math.round(Number(invoice.total) * 100)
  if (!(amountCents > 0)) {
    return { ok: false, status: 400, error: "Invoice amount must be greater than zero" }
  }

  const currency = String(invoice.currency || "USD").trim().toLowerCase()
  if (!currency) {
    return { ok: false, status: 400, error: "Invoice currency is required" }
  }

  const { data: biz } = await admin
    .from("businesses")
    .select("name, verification_status, verification_provider, noah_kyb_status, grid_customer_id")
    .eq("id", input.businessId)
    .maybeSingle()

  if (!isBusinessTier1Complete(biz)) {
    return { ok: false, status: 403, error: "Business verification is required before accepting online payments" }
  }

  // Reuse an open session for this invoice if still usable.
  const { data: existingOpen } = await admin
    .from("invoice_checkout_sessions")
    .select("*")
    .eq("invoice_id", invoice.id)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const stripe = getStripe()

  if (existingOpen?.stripe_checkout_session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(
        String(existingOpen.stripe_checkout_session_id),
      )
      if (session.status === "open" && session.client_secret) {
        return {
          ok: true,
          clientSecret: session.client_secret,
          publishableKey: getStripePublishableKey(),
          checkoutSessionId: session.id,
          settlementId: String(existingOpen.easner_settlement_id),
        }
      }
      await admin
        .from("invoice_checkout_sessions")
        .update({
          status: session.status === "complete" ? "complete" : "expired",
          completed_at: new Date().toISOString(),
        })
        .eq("id", existingOpen.id)
    } catch {
      await admin
        .from("invoice_checkout_sessions")
        .update({ status: "expired", completed_at: new Date().toISOString() })
        .eq("id", existingOpen.id)
    }
  }

  const settlementId = randomUUID()
  const idempotencyKey = stripeCheckoutIdempotencyKey(invoice.id, settlementId)
  const businessName =
    input.businessName?.trim() ||
    (typeof biz?.name === "string" ? biz.name.trim() : "") ||
    "Easner"

  const { data: sessionRow, error: insertErr } = await admin
    .from("invoice_checkout_sessions")
    .insert({
      invoice_id: invoice.id,
      business_id: input.businessId,
      easner_settlement_id: settlementId,
      status: "open",
      gross_cents: amountCents,
      currency: currency.toUpperCase(),
      customer_email: invoice.customerEmail || null,
      idempotency_key: idempotencyKey,
    })
    .select("id")
    .single()

  if (insertErr || !sessionRow?.id) {
    return {
      ok: false,
      status: 500,
      error: insertErr?.message || "Failed to create checkout session row",
    }
  }

  try {
    const session = await stripe.checkout.sessions.create(
      {
        ui_mode: "elements",
        mode: "payment",
        customer_email: invoice.customerEmail?.trim() || undefined,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: amountCents,
              product_data: {
                name: `Invoice ${invoice.invoiceNumber}`,
                description: `Payment to ${businessName}`,
              },
            },
          },
        ],
        payment_intent_data: {
          metadata: {
            easner_settlement_id: settlementId,
            easner_invoice_id: invoice.id,
            easner_invoice_number: invoice.invoiceNumber,
            easner_business_id: input.businessId,
          },
          statement_descriptor_suffix: buildStatementDescriptorSuffix({
            businessName,
            invoiceNumber: invoice.invoiceNumber,
          }),
        },
        metadata: {
          easner_settlement_id: settlementId,
          easner_invoice_id: invoice.id,
          easner_invoice_number: invoice.invoiceNumber,
          easner_business_id: input.businessId,
        },
        // Elements ui_mode requires return_url for redirect-based PMs; customer stays in Easner UI when possible.
        return_url: `${(process.env.NEXT_PUBLIC_APP_URL || "https://business.easner.com").replace(/\/$/, "")}/invoice-view/${encodeURIComponent(input.easetag?.trim() || "pay")}/${encodeURIComponent(invoice.invoiceNumber)}?stripe_session={CHECKOUT_SESSION_ID}`,
      },
      { idempotencyKey },
    )

    if (!session.client_secret) {
      await admin
        .from("invoice_checkout_sessions")
        .update({ status: "failed" })
        .eq("id", sessionRow.id)
      return { ok: false, status: 500, error: "Stripe session missing client secret" }
    }

    await admin
      .from("invoice_checkout_sessions")
      .update({
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null,
      })
      .eq("id", sessionRow.id)

    return {
      ok: true,
      clientSecret: session.client_secret,
      publishableKey: getStripePublishableKey(),
      checkoutSessionId: session.id,
      settlementId,
    }
  } catch (e) {
    await admin
      .from("invoice_checkout_sessions")
      .update({ status: "failed" })
      .eq("id", sessionRow.id)
    const msg = e instanceof Error ? e.message : "Failed to create Stripe Checkout Session"
    return { ok: false, status: 500, error: msg }
  }
}

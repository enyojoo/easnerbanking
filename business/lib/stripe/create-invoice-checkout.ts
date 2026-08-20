import type { SupabaseClient } from "@supabase/supabase-js"
import type { B2bInvoiceRow } from "@/lib/b2b/map-invoice"
import { mapRowToInvoice } from "@/lib/b2b/map-invoice"
import { buildInvoiceCustomerUrl } from "@/lib/invoice-public-url"
import { createOnlineCheckoutSession } from "./create-online-checkout-session"
import { getStripe } from "./client"
import { getConnectAccountRow } from "./connect"
import { getStripePublishableKey, isStripeInvoicePaymentsEnabled } from "./config"
import { buildEasnerStatementSuffix } from "./statement-descriptor"

const PAYABLE = new Set(["unpaid", "sent", "past_due"])

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
 * Invoice Pay online – validates the invoice, reuses an open session when possible,
 * then delegates to the shared Collections checkout rail.
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
    return { ok: false, status: 503, error: "Online invoice payments are not enabled" }
  }

  const invoice = mapRowToInvoice(input.invoiceRow)
  if (!PAYABLE.has(invoice.status)) {
    return { ok: false, status: 400, error: "Invoice is not payable" }
  }

  const amountCents = Math.round(Number(invoice.total) * 100)
  if (!(amountCents > 0)) {
    return { ok: false, status: 400, error: "Invoice amount must be greater than zero" }
  }

  const connectRow = await getConnectAccountRow(admin, input.businessId)
  const reused = await reuseOpenInvoiceSession(admin, invoice.id, {
    connectedAccountId: connectRow?.stripe_account_id?.trim() || null,
  })
  if (reused) return reused

  const returnUrl = `${buildInvoiceCustomerUrl(input.easetag, invoice)}?stripe_session={CHECKOUT_SESSION_ID}`

  const result = await createOnlineCheckoutSession(admin, {
    source: "invoice",
    businessId: input.businessId,
    mode: "payment",
    listedAmountCents: amountCents,
    currency: invoice.currency,
    productName: `Invoice ${invoice.invoiceNumber}`,
    productDescription: `Payment to ${input.businessName?.trim() || "Easner"}`,
    customerEmail: invoice.customerEmail || null,
    statementSuffix: buildEasnerStatementSuffix({ invoiceNumber: invoice.invoiceNumber }),
    returnUrl,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
  })

  if (!result.ok) return result
  return {
    ok: true,
    clientSecret: result.clientSecret,
    publishableKey: result.publishableKey,
    checkoutSessionId: result.checkoutSessionId,
    settlementId: result.settlementId,
  }
}

/**
 * Reuse the most recent open session for this invoice so repeat page loads do not
 * pile up Stripe sessions; expire the row when Stripe no longer accepts it or when
 * the payout destination has changed since the session was created.
 */
async function reuseOpenInvoiceSession(
  admin: SupabaseClient,
  invoiceId: string,
  opts: { connectedAccountId: string | null },
): Promise<CreateInvoiceCheckoutResult | null> {
  const { data: existingOpen } = await admin
    .from("invoice_checkout_sessions")
    .select("id, stripe_checkout_session_id, easner_settlement_id, stripe_connected_account_id")
    .eq("invoice_id", invoiceId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!existingOpen?.stripe_checkout_session_id) return null

  const expire = async (status: "complete" | "expired") => {
    await admin
      .from("invoice_checkout_sessions")
      .update({ status, completed_at: new Date().toISOString() })
      .eq("id", existingOpen.id)
  }

  const existingConnected =
    typeof existingOpen.stripe_connected_account_id === "string"
      ? existingOpen.stripe_connected_account_id
      : null
  if (opts.connectedAccountId && existingConnected && existingConnected !== opts.connectedAccountId) {
    await expire("expired")
    return null
  }

  try {
    const session = await getStripe().checkout.sessions.retrieve(
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
    await expire(session.status === "complete" ? "complete" : "expired")
  } catch {
    await expire("expired")
  }
  return null
}

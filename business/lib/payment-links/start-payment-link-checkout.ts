import type { SupabaseClient } from "@supabase/supabase-js"
import { buildPaymentThanksUrl } from "@/lib/payment-links/public-url"
import { mapRowToPaymentLink } from "@/lib/payment-links/types"
import { createOnlineCheckoutSession } from "@/lib/stripe/create-online-checkout-session"
import { getStripe } from "@/lib/stripe/client"
import { getStripePublishableKey } from "@/lib/stripe/config"
import { buildEasnerStatementSuffix } from "@/lib/stripe/statement-descriptor"

export type StartPaymentLinkCheckoutResult =
  | {
      ok: true
      clientSecret: string
      publishableKey: string
      customerAmountCents: number
      surchargeCents: number
    }
  | { ok: false; status: number; error: string }

/** Create an Elements checkout session for a resolved payment-link row. */
export async function startPaymentLinkCheckout(
  admin: SupabaseClient,
  row: Record<string, unknown>,
): Promise<StartPaymentLinkCheckoutResult> {
  const link = mapRowToPaymentLink(row)
  if (link.rail !== "card_bank") {
    return { ok: false, status: 400, error: "This link is not a card or bank link" }
  }
  if (link.mode === "subscription" && !row.stripe_price_id) {
    return {
      ok: false,
      status: 409,
      error: "This recurring link is not ready to accept payments",
    }
  }

  const businessId = String(row.business_id)
  const { data: biz } = await admin
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .maybeSingle()
  const businessName = typeof biz?.name === "string" ? biz.name : null

  const reused = await reuseOpenPaymentLinkSession(admin, link.id)
  if (reused) return reused

  const result = await createOnlineCheckoutSession(admin, {
    source: "payment_link",
    businessId,
    mode: link.mode === "subscription" ? "subscription" : "payment",
    listedAmountCents: link.amountCents,
    currency: link.currency,
    productName: link.label,
    productDescription: link.description,
    statementSuffix: buildEasnerStatementSuffix({ businessName }),
    returnUrl: link.redirectUrl || buildPaymentThanksUrl(),
    paymentLinkId: link.id,
    stripePriceId: typeof row.stripe_price_id === "string" ? row.stripe_price_id : null,
    trialDays: link.trialDays,
    metadata: { easner_payment_link_slug: link.slug },
  })

  if (!result.ok) {
    return { ok: false, status: result.status, error: result.error }
  }

  return {
    ok: true,
    clientSecret: result.clientSecret,
    publishableKey: result.publishableKey,
    customerAmountCents: result.amounts.customerAmountCents,
    surchargeCents: result.amounts.surchargeCents,
  }
}

async function reuseOpenPaymentLinkSession(
  admin: SupabaseClient,
  paymentLinkId: string,
): Promise<StartPaymentLinkCheckoutResult | null> {
  const { data: existing } = await admin
    .from("online_checkout_sessions")
    .select(
      "id, stripe_checkout_session_id, listed_amount_cents, gross_cents, application_fee_cents",
    )
    .eq("payment_link_id", paymentLinkId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!existing?.stripe_checkout_session_id) return null

  const expire = async () => {
    await admin
      .from("online_checkout_sessions")
      .update({ status: "expired", completed_at: new Date().toISOString() })
      .eq("id", existing.id)
  }

  try {
    const session = await getStripe().checkout.sessions.retrieve(
      String(existing.stripe_checkout_session_id),
    )
    if (session.status === "open" && session.client_secret) {
      const listed = Number(existing.listed_amount_cents) || 0
      const gross = Number(existing.gross_cents) || listed
      return {
        ok: true,
        clientSecret: session.client_secret,
        publishableKey: getStripePublishableKey(),
        customerAmountCents: gross,
        surchargeCents: Math.max(0, gross - listed),
      }
    }
    await expire()
  } catch {
    await expire()
  }
  return null
}

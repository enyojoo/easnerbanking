import type { SupabaseClient } from "@supabase/supabase-js"
import { buildPaymentThanksUrl } from "@/lib/payment-links/public-url"
import { mapRowToPaymentLink } from "@/lib/payment-links/types"
import { createOnlineCheckoutSession } from "@/lib/stripe/create-online-checkout-session"
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

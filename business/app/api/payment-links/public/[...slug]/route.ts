import { NextResponse } from "next/server"
import { buildPaymentThanksUrl } from "@/lib/payment-links/public-url"
import { buildPublicPaymentLinkPayload } from "@/lib/payment-links/public-payload"
import { resolvePublicPayPath } from "@/lib/payment-links/resolve-public-path"
import { mapRowToPaymentLink } from "@/lib/payment-links/types"
import { createOnlineCheckoutSession } from "@/lib/stripe/create-online-checkout-session"
import { buildEasnerStatementSuffix } from "@/lib/stripe/statement-descriptor"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

type Ctx = { params: Promise<{ slug: string[] }> }

/** Customer payload for a shared pay.easner.com URL. No auth: the URL is the capability. */
export async function GET(_request: Request, context: Ctx) {
  const { slug } = await context.params
  const admin = createSupabaseAdmin()
  const resolved = await resolvePublicPayPath(admin, slug ?? [])

  if (resolved.kind === "stablecoin_session") {
    return NextResponse.json({ kind: "stablecoin_session", sessionId: resolved.sessionId })
  }
  if (resolved.kind === "not_found") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const payload = await buildPublicPaymentLinkPayload(admin, resolved.row)
  return NextResponse.json(payload)
}

/** Start a card/bank payment for the resolved link and return the client secret. */
export async function POST(_request: Request, context: Ctx) {
  const { slug } = await context.params
  const admin = createSupabaseAdmin()
  const resolved = await resolvePublicPayPath(admin, slug ?? [])

  if (resolved.kind !== "payment_link") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const link = mapRowToPaymentLink(resolved.row)
  if (link.rail !== "card_bank") {
    return NextResponse.json({ error: "This link is not a card or bank link" }, { status: 400 })
  }
  if (link.mode === "subscription" && !resolved.row.stripe_price_id) {
    return NextResponse.json(
      { error: "This recurring link is not ready to accept payments" },
      { status: 409 },
    )
  }

  const businessId = String(resolved.row.business_id)
  const { data: biz } = await admin
    .from("businesses")
    .select("name, easetag")
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
    stripePriceId:
      typeof resolved.row.stripe_price_id === "string" ? resolved.row.stripe_price_id : null,
    trialDays: link.trialDays,
    metadata: { easner_payment_link_slug: link.slug },
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    clientSecret: result.clientSecret,
    publishableKey: result.publishableKey,
    customerAmountCents: result.amounts.customerAmountCents,
    surchargeCents: result.amounts.surchargeCents,
  })
}

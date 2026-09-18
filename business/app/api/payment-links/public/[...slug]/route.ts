import { NextResponse } from "next/server"
import { buildPublicPaymentLinkPayload } from "@/lib/payment-links/public-payload"
import { resolvePublicPayPath } from "@/lib/payment-links/resolve-public-path"
import { startPaymentLinkCheckout } from "@/lib/payment-links/start-payment-link-checkout"
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

  const result = await startPaymentLinkCheckout(admin, resolved.row)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({
    clientSecret: result.clientSecret,
    publishableKey: result.publishableKey,
    stripeAccountId: result.stripeAccountId,
    customerAmountCents: result.customerAmountCents,
    surchargeCents: result.surchargeCents,
  })
}

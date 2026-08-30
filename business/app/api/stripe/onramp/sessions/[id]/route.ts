import { NextResponse } from "next/server"
import { stripeOnramp } from "@/lib/stripe/onramp-client"
import { mapStripeOnrampRouteError } from "@/lib/stripe/log-onramp-api-error"
import { buildStripeOnrampCheckoutParams } from "@/lib/stripe/onramp-checkout-params"
import { ensureExpressDepositsLiveOAuth, resolveExpressDepositsContext } from "@/lib/stripe/onramp-context"
import { markOnrampSessionFailed } from "@/lib/stripe/onramp-ledger"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const resolved = await resolveExpressDepositsContext(request)
  if ("error" in resolved) return resolved.error
  const { id } = await ctx.params
  try {
    const liveOAuth = await ensureExpressDepositsLiveOAuth({
      admin: resolved.ctx.admin,
      payerUserId: resolved.ctx.payerUserId,
      customerId: resolved.ctx.payer.stripe_crypto_customer_id,
      oauthToken: resolved.ctx.oauthToken,
      oauthRefreshToken: resolved.ctx.oauthRefreshToken,
    })
    if (!liveOAuth) {
      return NextResponse.json({ error: "Complete Link sign-in first.", code: "link_auth_required" }, { status: 401 })
    }
    const session = await stripeOnramp.retrieveSession(id, liveOAuth)
    return NextResponse.json(session)
  } catch (e) {
    return mapStripeOnrampRouteError("sessions.get", e, {
      payerUserId: resolved.ctx.payerUserId,
      cryptoCustomerId: resolved.ctx.payer.stripe_crypto_customer_id,
      sessionId: id,
    })
  }
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const resolved = await resolveExpressDepositsContext(request)
  if ("error" in resolved) return resolved.error
  const { id } = await ctx.params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const action = String(body.action || "checkout")
  const liveOAuth = await ensureExpressDepositsLiveOAuth({
    admin: resolved.ctx.admin,
    payerUserId: resolved.ctx.payerUserId,
    customerId: resolved.ctx.payer.stripe_crypto_customer_id,
    oauthToken: resolved.ctx.oauthToken,
    oauthRefreshToken: resolved.ctx.oauthRefreshToken,
  })
  if (action !== "fail" && !liveOAuth) {
    return NextResponse.json({ error: "Complete Link sign-in first.", code: "link_auth_required" }, { status: 401 })
  }
  try {
    if (action === "quote") {
      const quoted = await stripeOnramp.quoteSession(
        id,
        body.params as Record<string, unknown> | undefined,
        liveOAuth,
      )
      return NextResponse.json(quoted)
    }
    if (action === "fail") {
      await markOnrampSessionFailed(resolved.ctx.admin, {
        stripeSessionId: id,
        reason: String(body.reason || "Payment could not be completed."),
      })
      return NextResponse.json({ ok: true })
    }
    const checkoutParams = buildStripeOnrampCheckoutParams(request, body)
    if ("error" in checkoutParams) {
      return NextResponse.json(
        { error: checkoutParams.error, code: checkoutParams.code },
        { status: 400 },
      )
    }
    const checked = await stripeOnramp.checkoutSession(id, checkoutParams, liveOAuth)
    const clientSecret = String(
      (checked as { client_secret?: string; clientSecret?: string }).client_secret ||
        (checked as { clientSecret?: string }).clientSecret ||
        "",
    )
    return NextResponse.json({ client_secret: clientSecret || undefined, session: checked })
  } catch (e) {
    return mapStripeOnrampRouteError("sessions.action", e, {
      payerUserId: resolved.ctx.payerUserId,
      cryptoCustomerId: resolved.ctx.payer.stripe_crypto_customer_id,
      sessionId: id,
      action,
    })
  }
}

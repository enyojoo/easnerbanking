import { NextResponse } from "next/server"
import {
  expressInstrumentFromCollectDetails,
  mergeExpressSavedPaymentMethods,
  parseExpressSavedPaymentMethods,
  type ExpressSavedPaymentRail,
} from "@easner/shared"
import { stripeOnramp } from "@/lib/stripe/onramp-client"
import { mapStripeOnrampRouteError } from "@/lib/stripe/log-onramp-api-error"
import { patchExpressPayer, resolveExpressDepositsContext, ensureExpressDepositsLiveOAuth } from "@/lib/stripe/onramp-context"

export const runtime = "nodejs"

function readRail(value: unknown): ExpressSavedPaymentRail | null {
  const rail = String(value || "").trim()
  if (rail === "card" || rail === "ach") return rail
  return null
}

export async function GET(request: Request) {
  const resolved = await resolveExpressDepositsContext(request)
  if ("error" in resolved) return resolved.error
  const customerId = resolved.ctx.payer.stripe_crypto_customer_id
  if (!customerId) return NextResponse.json({ data: [] })
  try {
    const liveOAuth = await ensureExpressDepositsLiveOAuth({
      admin: resolved.ctx.admin,
      payerUserId: resolved.ctx.payerUserId,
      customerId,
      oauthToken: resolved.ctx.oauthToken,
      oauthRefreshToken: resolved.ctx.oauthRefreshToken,
    })
    if (!liveOAuth) return NextResponse.json({ data: [] })
    const tokens = await stripeOnramp.listPaymentTokens(customerId, liveOAuth)
    return NextResponse.json(tokens)
  } catch (e) {
    return mapStripeOnrampRouteError("payment_tokens.list", e, {
      payerUserId: resolved.ctx.payerUserId,
      cryptoCustomerId: customerId,
    })
  }
}

export async function POST(request: Request) {
  const resolved = await resolveExpressDepositsContext(request)
  if ("error" in resolved) return resolved.error
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const paymentTokenId = String(body.paymentTokenId || "").trim()
  if (!paymentTokenId) {
    return NextResponse.json({ error: "paymentTokenId required" }, { status: 400 })
  }
  const railRaw = String(body.rail || "").trim()
  const rail = readRail(railRaw)
  if (railRaw && !rail) {
    return NextResponse.json({ error: "rail must be card or ach" }, { status: 400 })
  }

  const current = parseExpressSavedPaymentMethods(resolved.ctx.payer.stripe_express_payment_methods)
  const fromDetails = expressInstrumentFromCollectDetails(
    body.paymentMethodDetails && typeof body.paymentMethodDetails === "object"
      ? (body.paymentMethodDetails as Record<string, unknown>)
      : body,
  )
  const paymentMethods = rail
    ? mergeExpressSavedPaymentMethods(current, rail, {
        paymentTokenId,
        last4: String(body.last4 || "").trim() || fromDetails.last4 || null,
        brand: String(body.brand || "").trim() || fromDetails.brand || null,
        bankName: String(body.bankName || "").trim() || fromDetails.bankName || null,
      })
    : current

  await patchExpressPayer(resolved.ctx.admin, resolved.ctx.payerUserId, {
    stripe_express_payment_token_id: paymentTokenId,
    ...(rail ? { stripe_express_payment_methods: paymentMethods } : {}),
  })
  return NextResponse.json({ ok: true, paymentTokenId, paymentMethods })
}

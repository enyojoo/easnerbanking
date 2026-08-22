import { NextResponse } from "next/server"
import { StripeOnrampApiError, stripeOnramp } from "@/lib/stripe/onramp-client"
import { patchExpressPayer, resolveExpressDepositsContext } from "@/lib/stripe/onramp-context"

export const runtime = "nodejs"

function mapError(e: unknown) {
  if (e instanceof StripeOnrampApiError) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status >= 400 ? e.status : 400 })
  }
  return NextResponse.json({ error: e instanceof Error ? e.message : "Request failed" }, { status: 400 })
}

export async function GET(request: Request) {
  const resolved = await resolveExpressDepositsContext(request)
  if ("error" in resolved) return resolved.error
  const customerId = resolved.ctx.payer.stripe_crypto_customer_id
  if (!customerId) return NextResponse.json({ data: [] })
  try {
    const tokens = await stripeOnramp.listPaymentTokens(customerId, resolved.ctx.oauthToken || undefined)
    return NextResponse.json(tokens)
  } catch (e) {
    return mapError(e)
  }
}

export async function POST(request: Request) {
  const resolved = await resolveExpressDepositsContext(request)
  if ("error" in resolved) return resolved.error
  const body = (await request.json().catch(() => ({}))) as { paymentTokenId?: string }
  const paymentTokenId = String(body.paymentTokenId || "").trim()
  if (!paymentTokenId) {
    return NextResponse.json({ error: "paymentTokenId required" }, { status: 400 })
  }
  await patchExpressPayer(resolved.ctx.admin, resolved.ctx.payerUserId, {
    stripe_express_payment_token_id: paymentTokenId,
  })
  return NextResponse.json({ ok: true, paymentTokenId })
}

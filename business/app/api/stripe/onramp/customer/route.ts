import { NextResponse } from "next/server"
import { StripeOnrampApiError, stripeOnramp } from "@/lib/stripe/onramp-client"
import { ensureExpressDepositsLiveOAuth, kycPrefillFromPayer, patchExpressPayer, resolveExpressDepositsContext } from "@/lib/stripe/onramp-context"

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
  const id = resolved.ctx.payer.stripe_crypto_customer_id
  if (!id) return NextResponse.json({ customer: null, ready: false })
  try {
    const liveOAuth = await ensureExpressDepositsLiveOAuth({
      admin: resolved.ctx.admin,
      payerUserId: resolved.ctx.payerUserId,
      customerId: id,
      oauthToken: resolved.ctx.oauthToken,
      oauthRefreshToken: resolved.ctx.oauthRefreshToken,
    })
    const customer = await stripeOnramp.retrieveCustomer(id, liveOAuth || undefined)
    return NextResponse.json({ customer })
  } catch (e) {
    return mapError(e)
  }
}

export async function POST(request: Request) {
  const resolved = await resolveExpressDepositsContext(request)
  if ("error" in resolved) return resolved.error
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  try {
    let customerId = resolved.ctx.payer.stripe_crypto_customer_id
    let customer: Record<string, unknown>
    const liveOAuth = await ensureExpressDepositsLiveOAuth({
      admin: resolved.ctx.admin,
      payerUserId: resolved.ctx.payerUserId,
      customerId,
      oauthToken: resolved.ctx.oauthToken,
      oauthRefreshToken: resolved.ctx.oauthRefreshToken,
    })
    if (customerId) {
      customer = await stripeOnramp.retrieveCustomer(customerId, liveOAuth || undefined)
    } else {
      customer = await stripeOnramp.createCustomer(
        {
          email: resolved.ctx.payer.email || undefined,
          ...body,
        },
        liveOAuth || undefined,
      )
      customerId = String(customer.id || "")
      if (customerId) {
        await patchExpressPayer(resolved.ctx.admin, resolved.ctx.payerUserId, {
          stripe_crypto_customer_id: customerId,
          stripe_express_deposits_status: "in_progress",
        })
      }
    }
    return NextResponse.json({
      customer,
      prefill: kycPrefillFromPayer(resolved.ctx.payer),
    })
  } catch (e) {
    return mapError(e)
  }
}

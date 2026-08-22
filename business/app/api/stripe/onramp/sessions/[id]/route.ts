import { NextResponse } from "next/server"
import { StripeOnrampApiError, stripeOnramp } from "@/lib/stripe/onramp-client"
import { resolveExpressDepositsContext } from "@/lib/stripe/onramp-context"
import { markOnrampSessionFailed } from "@/lib/stripe/onramp-ledger"

export const runtime = "nodejs"

function mapError(e: unknown) {
  if (e instanceof StripeOnrampApiError) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status >= 400 ? e.status : 400 })
  }
  return NextResponse.json({ error: e instanceof Error ? e.message : "Request failed" }, { status: 400 })
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const resolved = await resolveExpressDepositsContext(request)
  if ("error" in resolved) return resolved.error
  const { id } = await ctx.params
  try {
    const session = await stripeOnramp.retrieveSession(id, resolved.ctx.oauthToken || undefined)
    return NextResponse.json(session)
  } catch (e) {
    return mapError(e)
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
  try {
    if (action === "quote") {
      const quoted = await stripeOnramp.quoteSession(
        id,
        body.params as Record<string, unknown> | undefined,
        resolved.ctx.oauthToken || undefined,
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
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    const userAgent = request.headers.get("user-agent") || undefined
    const checked = await stripeOnramp.checkoutSession(
      id,
      {
        payment_token: body.paymentTokenId || undefined,
        mandate_data: body.mandateData || undefined,
        customer_ip_address: ip || undefined,
        user_agent: userAgent,
      },
      resolved.ctx.oauthToken || undefined,
    )
    const clientSecret = String(
      (checked as { client_secret?: string; clientSecret?: string }).client_secret ||
        (checked as { clientSecret?: string }).clientSecret ||
        "",
    )
    return NextResponse.json({ client_secret: clientSecret || undefined, session: checked })
  } catch (e) {
    return mapError(e)
  }
}

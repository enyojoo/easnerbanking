import { NextResponse } from "next/server"
import { expressDepositsSourceCurrency, validateExpressDepositsAmount } from "@easner/shared"
import { StripeOnrampApiError } from "@/lib/stripe/onramp-client"
import { resolveExpressDepositsContext } from "@/lib/stripe/onramp-context"
import { getTurnkeyDepositAddressesForBusiness, getTurnkeyDepositAddressesForContext } from "@/lib/wallet/turnkey-deposit-addresses"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { quoteExpressDepositsPricing } from "@/lib/stripe/express-deposits-pricing-server"

export const runtime = "nodejs"

function mapError(e: unknown) {
  if (e instanceof StripeOnrampApiError) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status >= 400 ? e.status : 400 })
  }
  return NextResponse.json({ error: e instanceof Error ? e.message : "Request failed" }, { status: 400 })
}

export async function POST(request: Request) {
  const resolved = await resolveExpressDepositsContext(request)
  if ("error" in resolved) return resolved.error
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const destinationAmount = String(body.destinationAmount ?? body.usdCredit ?? "").trim()
  const paymentMethod = String(body.paymentMethod ?? "card").trim()
  const sourceCurrency = expressDepositsSourceCurrency(resolved.ctx.payerCountry) ?? "usd"
  const usdCredit = Number(destinationAmount || 0)
  if (!(usdCredit > 0)) {
    return NextResponse.json({ error: "Enter a valid amount", code: "invalid_amount" }, { status: 400 })
  }

  try {
    const accountCtx = await resolveNoahAccountContext(request, resolved.ctx.actorUserId)
    if (!accountCtx.ok) return accountCtx.response
    const lines = resolved.ctx.businessId
      ? await getTurnkeyDepositAddressesForBusiness(resolved.ctx.admin, resolved.ctx.businessId, {
          mode: "fast",
        })
      : await getTurnkeyDepositAddressesForContext(resolved.ctx.admin, accountCtx.ctx, { mode: "fast" })
    const wallet = String(lines.USD.ownerAddress || "").trim()

    const quoted = await quoteExpressDepositsPricing({
      admin: resolved.ctx.admin,
      usdCredit,
      sourceCurrency,
      paymentMethod,
      walletAddress: wallet,
      oauthToken: resolved.ctx.oauthToken,
      userId: resolved.ctx.payerUserId,
      businessId: resolved.ctx.businessId,
    })
    if (!quoted) {
      return NextResponse.json({ error: "Quote unavailable", code: "quote_unavailable" }, { status: 400 })
    }

    const afterQuote = validateExpressDepositsAmount({
      usdCredit,
      youPay: quoted.pricing.totalToPay,
      sourceCurrency,
    })
    if (!afterQuote.ok) {
      return NextResponse.json({ error: afterQuote.message, code: afterQuote.code }, { status: 400 })
    }

    return NextResponse.json({
      ...((quoted.rawQuote as object) ?? {}),
      sourceCurrency: sourceCurrency.toUpperCase(),
      pricing: quoted.pricing,
      rateFetchedAt: quoted.pricing.rateFetchedAt ?? null,
    })
  } catch (e) {
    return mapError(e)
  }
}

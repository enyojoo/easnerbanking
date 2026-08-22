import { NextResponse } from "next/server"
import { expressDepositsSourceCurrency, validateExpressDepositsAmount } from "@easner/shared"
import { StripeOnrampApiError, stripeOnramp } from "@/lib/stripe/onramp-client"
import { resolveExpressDepositsContext } from "@/lib/stripe/onramp-context"
import { getTurnkeyDepositAddressesForBusiness, getTurnkeyDepositAddressesForContext } from "@/lib/wallet/turnkey-deposit-addresses"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"

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
  const sourceAmount = String(body.sourceAmount ?? "").trim()
  const paymentMethod = String(body.paymentMethod ?? "card").trim()
  const sourceCurrency = expressDepositsSourceCurrency(resolved.ctx.payerCountry) ?? "usd"
  const usdCredit = Number(destinationAmount || 0)
  const youPayHint = Number(sourceAmount || 0)
  if (usdCredit > 0) {
    const limit = validateExpressDepositsAmount({
      usdCredit,
      youPay: youPayHint > 0 ? youPayHint : null,
      sourceCurrency,
    })
    if (!limit.ok) {
      return NextResponse.json({ error: limit.message, code: limit.code }, { status: 400 })
    }
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
    const quote = await stripeOnramp.quotes(
      {
        destination_currencies: ["usdc"],
        destination_networks: ["solana"],
        destination_amount: destinationAmount || undefined,
        source_amount: sourceAmount || undefined,
        source_currency: sourceCurrency,
        payment_method: paymentMethod === "ach" ? "ach" : "debit_card",
        wallet_addresses: wallet ? { solana: wallet } : undefined,
      },
      resolved.ctx.oauthToken || undefined,
    )
    const quoted = quote as {
      source_amount?: string
      source_total_amount?: string
      quotes?: Array<{ source_amount?: string; source_total_amount?: string }>
    }
    const quotedPay = Number(
      quoted.source_total_amount ??
        quoted.source_amount ??
        quoted.quotes?.[0]?.source_total_amount ??
        quoted.quotes?.[0]?.source_amount ??
        0,
    )
    if (usdCredit > 0 && quotedPay > 0) {
      const afterQuote = validateExpressDepositsAmount({
        usdCredit,
        youPay: quotedPay,
        sourceCurrency,
      })
      if (!afterQuote.ok) {
        return NextResponse.json({ error: afterQuote.message, code: afterQuote.code }, { status: 400 })
      }
    }
    return NextResponse.json({ ...quote, sourceCurrency })
  } catch (e) {
    return mapError(e)
  }
}

import { NextResponse } from "next/server"
import { expressDepositsSourceCurrency, validateExpressDepositsAmount } from "@easner/shared"
import { StripeOnrampApiError, stripeOnramp } from "@/lib/stripe/onramp-client"
import { resolveExpressDepositsContext } from "@/lib/stripe/onramp-context"
import { getTurnkeyDepositAddressesForBusiness, getTurnkeyDepositAddressesForContext } from "@/lib/wallet/turnkey-deposit-addresses"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { insertPendingOnrampSession } from "@/lib/stripe/onramp-ledger"

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
  if (!resolved.ctx.payer.stripe_crypto_customer_id) {
    return NextResponse.json({ error: "Set up Express deposits first." }, { status: 403 })
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const customerId = resolved.ctx.payer.stripe_crypto_customer_id
  const usdCredit = Number(body.usdCredit ?? body.destinationAmount ?? 0)
  const paymentMethod = String(body.paymentMethod ?? "card")
  const paymentToken = String(body.paymentTokenId ?? resolved.ctx.payer.stripe_express_payment_token_id ?? "")
  const sourceCurrency = expressDepositsSourceCurrency(resolved.ctx.payerCountry) ?? "usd"
  const sourceAmount = Number(body.sourceAmount ?? body.youPay ?? 0)
  const limit = validateExpressDepositsAmount({
    usdCredit,
    youPay: sourceAmount > 0 ? sourceAmount : null,
    sourceCurrency,
  })
  if (!limit.ok) {
    return NextResponse.json({ error: limit.message, code: limit.code }, { status: 400 })
  }

  try {
    const accountCtx = await resolveNoahAccountContext(request, resolved.ctx.actorUserId)
    if (!accountCtx.ok) return accountCtx.response
    const lines = resolved.ctx.businessId
      ? await getTurnkeyDepositAddressesForBusiness(resolved.ctx.admin, resolved.ctx.businessId, {
          mode: "ensure",
        })
      : await getTurnkeyDepositAddressesForContext(resolved.ctx.admin, accountCtx.ctx, { mode: "ensure" })
    const wallet = String(lines.USD.ownerAddress || "").trim()
    if (!wallet) {
      return NextResponse.json({ error: "Wallet is still provisioning. Try again shortly." }, { status: 409 })
    }

    const session = await stripeOnramp.createSession(
      {
        crypto_customer_id: customerId,
        destination_currency: "usdc",
        destination_network: "solana",
        destination_networks: ["solana"],
        destination_amount: usdCredit > 0 ? String(usdCredit) : undefined,
        source_currency: sourceCurrency,
        wallet_address: wallet,
        lock_wallet_address: true,
        payment_method:
          paymentMethod === "ach"
            ? "ach"
            : paymentMethod === "apple_pay"
              ? "apple_pay"
              : paymentMethod === "google_pay"
                ? "google_pay"
                : "card",
        payment_token: paymentToken || undefined,
      },
      resolved.ctx.oauthToken || undefined,
    )
    const stripeSessionId = String((session as { id?: string }).id || "")
    let easnerTransactionId: string | null = null
    if (stripeSessionId) {
      easnerTransactionId = await insertPendingOnrampSession(resolved.ctx.admin, {
        userId: resolved.ctx.payerUserId,
        businessId: resolved.ctx.businessId,
        stripeSessionId,
        cryptoCustomerId: customerId,
        usdCredit: usdCredit > 0 ? usdCredit : null,
        sourceAmount: sourceAmount > 0 ? sourceAmount : null,
        sourceCurrency,
        paymentMethod,
        walletAddress: wallet,
      })
    }
    return NextResponse.json({ session, walletAddress: wallet, sourceCurrency, easnerTransactionId })
  } catch (e) {
    return mapError(e)
  }
}

import { NextResponse } from "next/server"
import {
  buildExpressDepositsDepositReview,
  expressDepositsSessionCreateParams,
  expressDepositsSourceCurrency,
  expressSavedInstrumentForMethod,
  parseExpressDepositsAmountEntryMode,
  parseExpressSavedPaymentMethods,
  validateExpressDepositsAmount,
} from "@easner/shared"
import { StripeOnrampApiError, stripeOnramp } from "@/lib/stripe/onramp-client"
import { ensureExpressDepositsLiveOAuth, resolveExpressDepositsContext } from "@/lib/stripe/onramp-context"
import { getTurnkeyDepositAddressesForBusiness, getTurnkeyDepositAddressesForContext } from "@/lib/wallet/turnkey-deposit-addresses"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { insertPendingOnrampSession } from "@/lib/stripe/onramp-ledger"
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
  if (!resolved.ctx.payer.stripe_crypto_customer_id) {
    return NextResponse.json({ error: "Set up Express deposits first." }, { status: 403 })
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const customerId = resolved.ctx.payer.stripe_crypto_customer_id
  const usdCredit = Number(body.usdCredit ?? body.destinationAmount ?? 0)
  const youPay = Number(body.youPay ?? body.sourceAmount ?? 0)
  const amountEntryMode = parseExpressDepositsAmountEntryMode(String(body.amountEntryMode ?? ""))
  const paymentMethod = String(body.paymentMethod ?? "card")
  const savedMethods = parseExpressSavedPaymentMethods(resolved.ctx.payer.stripe_express_payment_methods)
  const railKind = paymentMethod === "ach" ? "express_ach" : paymentMethod === "card" ? "express_card" : null
  const railToken = railKind
    ? expressSavedInstrumentForMethod(savedMethods, railKind)?.paymentTokenId
    : null
  const paymentToken = String(
    body.paymentTokenId ?? railToken ?? resolved.ctx.payer.stripe_express_payment_token_id ?? "",
  )
  if (!paymentToken && paymentMethod !== "apple_pay" && paymentMethod !== "google_pay") {
    return NextResponse.json({ error: "Save a payment method first.", code: "payment_token_required" }, { status: 400 })
  }
  const sourceCurrency = expressDepositsSourceCurrency(resolved.ctx.payerCountry) ?? "usd"
  const beforeQuote = validateExpressDepositsAmount({
    usdCredit,
    youPay,
    sourceCurrency,
    amountEntryMode,
  })
  if (!beforeQuote.ok) {
    return NextResponse.json({ error: beforeQuote.message, code: beforeQuote.code }, { status: 400 })
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

    const quoted = await quoteExpressDepositsPricing({
      admin: resolved.ctx.admin,
      usdCredit,
      youPay,
      amountEntryMode,
      sourceCurrency,
      paymentMethod,
      walletAddress: wallet,
      userId: resolved.ctx.payerUserId,
      businessId: resolved.ctx.businessId,
    })
    if (!quoted) {
      return NextResponse.json({ error: "Quote unavailable", code: "quote_unavailable" }, { status: 400 })
    }

    const limit = validateExpressDepositsAmount({
      usdCredit: quoted.pricing.usdCredit,
      youPay: quoted.pricing.totalToPay,
      sourceCurrency,
      amountEntryMode,
    })
    if (!limit.ok) {
      return NextResponse.json({ error: limit.message, code: limit.code }, { status: 400 })
    }

    const depositReview = buildExpressDepositsDepositReview({
      pricing: quoted.pricing,
      paymentMethod,
      paymentMethodBrand:
        paymentMethod === "card"
          ? expressSavedInstrumentForMethod(savedMethods, "express_card")?.brand
          : null,
      paymentMethodLast4:
        paymentMethod === "card"
          ? expressSavedInstrumentForMethod(savedMethods, "express_card")?.last4
          : paymentMethod === "ach"
            ? expressSavedInstrumentForMethod(savedMethods, "express_ach")?.last4
            : null,
      paymentMethodBankName:
        paymentMethod === "ach"
          ? expressSavedInstrumentForMethod(savedMethods, "express_ach")?.bankName
          : null,
    })

    const baseSessionParams = {
      crypto_customer_id: customerId,
      destination_currency: "usdc",
      destination_network: "solana",
      destination_networks: ["solana"],
      source_currency: sourceCurrency,
      wallet_address: wallet,
      lock_wallet_address: true,
      payment_token: paymentToken || undefined,
    }

    const sessionParams = expressDepositsSessionCreateParams({
      pricing: quoted.pricing,
      baseParams: baseSessionParams,
    })

    const liveOAuth = await ensureExpressDepositsLiveOAuth({
      admin: resolved.ctx.admin,
      payerUserId: resolved.ctx.payerUserId,
      customerId,
      oauthToken: resolved.ctx.oauthToken,
      oauthRefreshToken: resolved.ctx.oauthRefreshToken,
    })
    if (!liveOAuth) {
      return NextResponse.json({ error: "Complete Link sign-in first.", code: "link_auth_required" }, { status: 401 })
    }
    const session = await stripeOnramp.createSession(sessionParams, liveOAuth)
    const stripeSessionId = String((session as { id?: string }).id || "")
    let easnerTransactionId: string | null = null
    if (stripeSessionId) {
      easnerTransactionId = await insertPendingOnrampSession(resolved.ctx.admin, {
        userId: resolved.ctx.payerUserId,
        businessId: resolved.ctx.businessId,
        stripeSessionId,
        cryptoCustomerId: customerId,
        usdCredit: quoted.pricing.usdCredit > 0 ? quoted.pricing.usdCredit : null,
        sourceAmount: quoted.pricing.totalToPay,
        sourceCurrency,
        paymentMethod,
        walletAddress: wallet,
        depositReview,
      })
    }
    return NextResponse.json({
      session,
      walletAddress: wallet,
      sourceCurrency: sourceCurrency.toUpperCase(),
      easnerTransactionId,
      pricing: quoted.pricing,
    })
  } catch (e) {
    return mapError(e)
  }
}

import { NextResponse } from "next/server"
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
  const { admin, businessId, actorUserId, payer } = resolved.ctx
  const customerId = payer.stripe_crypto_customer_id
  if (!customerId) {
    return NextResponse.json({ error: "Complete sign-in first." }, { status: 400 })
  }

  try {
    const accountCtx = await resolveNoahAccountContext(request, actorUserId)
    if (!accountCtx.ok) return accountCtx.response
    const lines = businessId
      ? await getTurnkeyDepositAddressesForBusiness(admin, businessId, { mode: "ensure" })
      : await getTurnkeyDepositAddressesForContext(admin, accountCtx.ctx, { mode: "ensure" })
    const wallet = String(lines.USD.ownerAddress || "").trim()
    if (!wallet) {
      return NextResponse.json({ error: "Wallet is still provisioning. Try again shortly." }, { status: 409 })
    }
    const registered = await stripeOnramp.registerWallet(
      customerId,
      {
        network: "solana",
        wallet_address: wallet,
      },
      resolved.ctx.oauthToken || undefined,
    )
    return NextResponse.json({ walletAddress: wallet, network: "solana", registered })
  } catch (e) {
    return mapError(e)
  }
}

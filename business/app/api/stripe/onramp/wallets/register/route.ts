import { NextResponse } from "next/server"
import { StripeOnrampApiError, stripeOnramp } from "@/lib/stripe/onramp-client"
import { ensureExpressDepositsLiveOAuth, resolveExpressDepositsContext } from "@/lib/stripe/onramp-context"
import { getTurnkeyDepositAddressesForBusiness, getTurnkeyDepositAddressesForContext } from "@/lib/wallet/turnkey-deposit-addresses"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"

export const runtime = "nodejs"

function mapError(e: unknown) {
  if (e instanceof StripeOnrampApiError) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status >= 400 ? e.status : 400 })
  }
  return NextResponse.json({ error: e instanceof Error ? e.message : "Request failed" }, { status: 400 })
}

function walletAddressOf(row: unknown): string {
  if (!row || typeof row !== "object") return ""
  const rec = row as { wallet_address?: unknown; walletAddress?: unknown; address?: unknown }
  return String(rec.wallet_address || rec.walletAddress || rec.address || "").trim()
}

export async function POST(request: Request) {
  const resolved = await resolveExpressDepositsContext(request)
  if ("error" in resolved) return resolved.error
  const { admin, businessId, actorUserId, payer, oauthToken, oauthRefreshToken, payerUserId } = resolved.ctx
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
    let registered = false
    try {
      const liveOAuth = await ensureExpressDepositsLiveOAuth({
        admin,
        payerUserId,
        customerId,
        oauthToken,
        oauthRefreshToken,
      })
      if (liveOAuth) {
        const wallets = (await stripeOnramp.listWallets(customerId, liveOAuth)) as {
          data?: unknown[]
        }
        registered = (wallets.data ?? []).some((row) => walletAddressOf(row) === wallet)
      }
    } catch {
      registered = false
    }
    return NextResponse.json({ walletAddress: wallet, network: "solana", registered })
  } catch (e) {
    return mapError(e)
  }
}

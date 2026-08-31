import { NextResponse } from "next/server"
import { requireAuth } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { isRelayConfigured } from "@/lib/relay/config"
import { resolveTurnkeyAddressForNoahPair } from "@/lib/wallet/resolve-wallet-owner"
import { resolveWalletOwnerIdForEasnerContext } from "@/lib/wallet/resolve-wallet-owner"
import { quoteBalanceConvert } from "@/lib/balance-convert/quote-convert"
import { settlementAssetForBalance } from "@/lib/wallet-send/routing"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  if (!isRelayConfigured()) {
    return NextResponse.json({ error: "relay_not_configured" }, { status: 503 })
  }

  const acc = await resolveNoahAccountContext(request, auth.user.id, undefined, "write")
  if (!acc.ok) return acc.response

  const body = (await request.json().catch(() => null)) as {
    direction?: "usd_to_eur" | "eur_to_usd"
    sourceAmount?: number
  } | null

  const direction = body?.direction
  const sourceAmount = Number(body?.sourceAmount)
  if (direction !== "usd_to_eur" && direction !== "eur_to_usd") {
    return NextResponse.json({ error: "invalid_direction" }, { status: 400 })
  }
  if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) {
    return NextResponse.json({ error: "invalid_source_amount" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const ownerId = await resolveWalletOwnerIdForEasnerContext(admin, acc.ctx)
  if (!ownerId) return NextResponse.json({ error: "no_wallet_owner" }, { status: 404 })

  const balanceCurrency = direction === "usd_to_eur" ? "USD" : "EUR"
  const asset = settlementAssetForBalance(balanceCurrency)
  const fromAddress = await resolveTurnkeyAddressForNoahPair(admin, acc.ctx, asset, "Solana")
  if (!fromAddress) return NextResponse.json({ error: "no_source_vault" }, { status: 404 })

  try {
    const quote = await quoteBalanceConvert({
      admin,
      walletOwnerId: ownerId,
      userId: auth.user.id,
      direction,
      sourceAmount,
      fromAddress,
    })
    return NextResponse.json({
      ok: true,
      quote: {
        sessionId: quote.sessionId,
        sourceAmount: quote.sourceAmount,
        destinationAmount: quote.destinationAmount,
        expiresAt: quote.expiresAt,
        rate: quote.rate,
        processingFee: quote.processingFee,
        totalDebited: quote.totalDebited,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "quote_failed"
    const status = message === "min_amount_not_met" ? 400 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

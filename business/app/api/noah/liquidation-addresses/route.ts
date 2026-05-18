import { NextResponse } from "next/server"
import { requireAuth, requireNoahEnv } from "../_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { getNoahLiquidationAddressForCustomer } from "@/lib/noah/provisioning"
import { ensureCurrencyUsable } from "@/lib/accounts/currency-controls"

export async function GET(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response

  const guard = await requireNoahVerificationApproved(
      acc.ctx.subjectUserId,
      acc.ctx.scope,
      acc.ctx.subjectBusinessId,
    )
  if (guard) return guard

  const url = new URL(request.url)
  const currency = (url.searchParams.get("currency") || "usdc").toLowerCase()
  const chain = (url.searchParams.get("chain") || "solana").toLowerCase()
  if (currency !== "usdc" && currency !== "eurc") {
    return NextResponse.json({ error: "currency must be usdc or eurc" }, { status: 400 })
  }
  if (chain !== "solana") {
    return NextResponse.json({ error: "chain must be solana" }, { status: 400 })
  }
  const fiatCode = currency === "usdc" ? "USD" : "EUR"
  const guardCurrency = await ensureCurrencyUsable(fiatCode)
  if (!guardCurrency.ok) {
    return NextResponse.json({ error: guardCurrency.reason, code: "CURRENCY_DISABLED" }, { status: 403 })
  }

  const result = await getNoahLiquidationAddressForCustomer({
    subjectUserId: acc.ctx.subjectUserId,
    subjectBusinessId: acc.ctx.subjectBusinessId,
    noahCustomerId: acc.ctx.noahCustomerId,
    currency,
    ensureCreated: false,
  })

  return NextResponse.json({
    hasAddress: result.hasAddress,
    currency,
    chain,
    address: result.address,
    memo: result.memo,
    liquidationAddressId: result.address ?? null,
  })
}

export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response

  const guard = await requireNoahVerificationApproved(
      acc.ctx.subjectUserId,
      acc.ctx.scope,
      acc.ctx.subjectBusinessId,
    )
  if (guard) return guard

  let body: { currency?: string; chain?: string } = {}
  try {
    body = await request.json()
  } catch {
    /* empty */
  }
  const currency = String(body.currency || "usdc").toLowerCase()
  const chain = String(body.chain || "solana").toLowerCase()
  if (currency !== "usdc" && currency !== "eurc") {
    return NextResponse.json({ error: "currency must be usdc or eurc" }, { status: 400 })
  }
  if (chain !== "solana") {
    return NextResponse.json({ error: "chain must be solana" }, { status: 400 })
  }
  const fiatCode = currency === "usdc" ? "USD" : "EUR"
  const guardCurrency = await ensureCurrencyUsable(fiatCode)
  if (!guardCurrency.ok) {
    return NextResponse.json({ error: guardCurrency.reason, code: "CURRENCY_DISABLED" }, { status: 403 })
  }

  const result = await getNoahLiquidationAddressForCustomer({
    subjectUserId: acc.ctx.subjectUserId,
    subjectBusinessId: acc.ctx.subjectBusinessId,
    noahCustomerId: acc.ctx.noahCustomerId,
    currency,
    ensureCreated: true,
  })

  return NextResponse.json({
    hasAddress: result.hasAddress,
    currency,
    chain,
    address: result.address,
    memo: result.memo,
    liquidationAddressId: result.address ?? null,
  })
}

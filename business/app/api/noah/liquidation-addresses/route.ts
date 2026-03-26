import { NextResponse } from "next/server"
import { requireAuth, requireNoahEnv } from "../_helpers"

/**
 * Bridge-style liquidation addresses are not exposed as a single Noah REST resource.
 * Onchain deposit → fiat uses `/workflows/onchain-deposit-to-payment-method` + FormSession (see Noah docs).
 * Until that flow is wired, return a safe stub so the app can fall back to `/wallets`.
 */
export async function GET(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  const url = new URL(request.url)
  const currency = url.searchParams.get("currency") || "usdc"
  const chain = url.searchParams.get("chain") || "solana"

  return NextResponse.json({
    hasAddress: false,
    currency,
    chain,
    address: undefined,
    memo: undefined,
    liquidationAddressId: undefined,
    message: "Noah onchain deposit workflow not configured for this deployment.",
  })
}

export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  let body: { currency?: string; chain?: string } = {}
  try {
    body = await request.json()
  } catch {
    /* empty */
  }

  return NextResponse.json({
    hasAddress: false,
    currency: body.currency,
    chain: body.chain,
    address: undefined,
    memo: undefined,
    liquidationAddressId: undefined,
    message: "Use Noah hosted onchain-deposit workflow or prepare+sell for payouts.",
  })
}

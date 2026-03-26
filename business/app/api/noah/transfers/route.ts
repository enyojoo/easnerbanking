import { NextResponse } from "next/server"
import { requireAuth, requireNoahEnv } from "../_helpers"

/**
 * Bridge-style wallet→bank transfer maps to Noah `transactions/sell` (Reliance) or hosted checkout.
 * That flow requires prepare+sell or hosted UI — not a direct drop-in from legacy body shape.
 */
export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  return NextResponse.json(
    {
      error:
        "Outbound fiat payout is not available via this compatibility endpoint. Use Noah prepare+sell or hosted checkout (Reliance model), or wire a new mapping from this payload to POST /transactions/sell.",
      code: "NOAH_TRANSFER_REQUIRES_SELL_FLOW",
    },
    { status: 501 }
  )
}

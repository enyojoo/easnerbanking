import { NextResponse } from "next/server"
import { requireAuth, requireNoahEnv } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { createTurnkeySend } from "@/lib/turnkey/send"

export const runtime = "nodejs"

type Body = {
  asset?: "USDC" | "EURC"
  chain?: "solana"
  destinationAddress?: string
  amount?: number | string
}

export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error

  const accountCtx = await resolveNoahAccountContext(request, auth.user.id)
  if (!accountCtx.ok) return accountCtx.response

  const body = (await request.json().catch(() => null)) as Body | null
  const asset = String(body?.asset || "").toUpperCase()
  const chain = String(body?.chain || "solana").toLowerCase()
  const destinationAddress = String(body?.destinationAddress || "").trim()
  const amount = Number(body?.amount ?? Number.NaN)
  if ((asset !== "USDC" && asset !== "EURC") || chain !== "solana" || !destinationAddress || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "asset(USDC|EURC), chain(solana), destinationAddress and positive amount are required" },
      { status: 400 },
    )
  }

  try {
    const admin = createSupabaseAdmin()
    const created = await createTurnkeySend(admin, {
      ctx: accountCtx.ctx,
      asset: asset as "USDC" | "EURC",
      chain: "solana",
      destinationAddress,
      amount,
    })
    return NextResponse.json({
      ok: true,
      provider: "turnkey",
      provider_transaction_id: created.providerTransactionId,
      transaction_id: created.ledgerId,
      status: created.status,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "send_failed"
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
}

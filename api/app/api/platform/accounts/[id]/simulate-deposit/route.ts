import { NextResponse } from "next/server"
import { creditPlatformAccountFromInbound } from "@/lib/platform/ledger"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const business = await requireEasnerBusinessId(user.id)
  if (!business.ok) return business.response
  const livemode = new URL(request.url).searchParams.get("livemode") === "live"
  if (livemode) {
    return NextResponse.json({ error: "Simulate deposits only work in Test." }, { status: 400 })
  }
  const { id } = await ctx.params
  const body = (await request.json().catch(() => null)) as { amount?: number } | null
  const amountCents = Math.round(Number(body?.amount ?? 10_00))
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "amount must be a positive integer in cents" }, { status: 400 })
  }
  const admin = createSupabaseAdmin()
  const { data: account } = await admin
    .from("platform_accounts")
    .select("id, livemode")
    .eq("id", id)
    .eq("business_id", business.businessId)
    .eq("livemode", false)
    .maybeSingle()
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 })
  try {
    const result = await creditPlatformAccountFromInbound(admin, {
      accountId: id,
      amountCents,
      type: "deposit",
      description: "Simulated test deposit",
      inboundKey: `simulate:${id}:${Date.now()}`,
    })
    if ("skipped" in result) {
      return NextResponse.json({ error: "Deposit was skipped" }, { status: 409 })
    }
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not simulate deposit" },
      { status: 400 },
    )
  }
}

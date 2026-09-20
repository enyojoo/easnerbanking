import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = createSupabaseAdmin()
  const { id } = await ctx.params
  const { data } = await admin
    .from("platform_onramp_sessions")
    .select("id, amount_cents, currency, status, livemode, return_url")
    .eq("id", id)
    .maybeSingle()
  if (!data?.id) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({
    id: data.id,
    amount: Number(data.amount_cents),
    currency: String(data.currency).toUpperCase(),
    status: data.status,
    livemode: Boolean(data.livemode),
    return_url: data.return_url,
  })
}

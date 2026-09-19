import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const { id } = await context.params
  const walletId = String(id || "").trim()
  if (!walletId) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 })
  }

  const body = (await request.json().catch(() => null)) as { archived?: boolean } | null
  if (body?.archived !== true) {
    return NextResponse.json({ error: "Only archived: true is supported." }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const now = new Date().toISOString()
  const { data: updated, error } = await admin
    .from("autopayout_payer_wallets")
    .update({
      archived_at: now,
      archived_by: user.id,
      updated_at: now,
    })
    .eq("id", walletId)
    .eq("business_id", ctx.businessId)
    .is("archived_at", null)
    .select("id")
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (!updated) {
    return NextResponse.json({ error: "Wallet not found or already archived." }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}

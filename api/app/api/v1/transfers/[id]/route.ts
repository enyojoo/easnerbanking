import { NextResponse } from "next/server"
import { publicTransfer } from "@/lib/platform/objects"
import { requireMerchant, v1Error } from "@/lib/platform/v1"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = createSupabaseAdmin()
  const auth = await requireMerchant(admin, request, "accounts.read")
  if (!auth.ok) return auth.response
  const { id } = await ctx.params
  const { data } = await admin
    .from("platform_transfers")
    .select("id, quote_id, source_account_id, destination_id, amount_cents, currency, status, livemode, created_at")
    .eq("id", id)
    .eq("business_id", auth.ctx.businessId)
    .maybeSingle()
  if (!data) return v1Error(404, "not_found", "Not found")
  return NextResponse.json(publicTransfer(data))
}

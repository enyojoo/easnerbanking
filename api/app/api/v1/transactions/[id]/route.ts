import { NextResponse } from "next/server"
import { publicTransaction } from "@/lib/platform/ledger"
import { requireMerchant, v1Error } from "@/lib/platform/v1"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = createSupabaseAdmin()
  const auth = await requireMerchant(admin, request, "accounts.read")
  if (!auth.ok) return auth.response
  const { id } = await ctx.params
  const livemode = auth.ctx.mode === "live"
  const { data } = await admin
    .from("platform_transactions")
    .select(
      "id, type, amount_cents, currency, direction, status, account_id, customer_id, transfer_id, checkout_session_id, description, livemode, created_at",
    )
    .eq("id", id)
    .eq("business_id", auth.ctx.businessId)
    .eq("livemode", livemode)
    .maybeSingle()
  if (!data) return v1Error(404, "not_found", "Not found")
  return NextResponse.json(publicTransaction(data))
}

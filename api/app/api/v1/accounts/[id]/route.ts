import { NextResponse } from "next/server"
import { publicAccount } from "@/lib/platform/ledger"
import { logPlatformApi, requireMerchant, v1Error } from "@/lib/platform/v1"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = createSupabaseAdmin()
  const auth = await requireMerchant(admin, request, "accounts.read")
  if (!auth.ok) return auth.response
  const { id } = await ctx.params
  const livemode = auth.ctx.mode === "live"
  const { data } = await admin
    .from("platform_accounts")
    .select("id, currency, available_cents, pending_cents, livemode, customer_id")
    .eq("id", id)
    .eq("business_id", auth.ctx.businessId)
    .eq("livemode", livemode)
    .maybeSingle()
  if (!data) {
    await logPlatformApi(admin, {
      startedAt: auth.ctx.startedAt,
      businessId: auth.ctx.businessId,
      livemode,
      method: "GET",
      path: `/v1/accounts/${id}`,
      status: 404,
      errorCode: "not_found",
    })
    return v1Error(404, "not_found", "Not found")
  }
  await logPlatformApi(admin, {
    startedAt: auth.ctx.startedAt,
    businessId: auth.ctx.businessId,
    livemode,
    method: "GET",
    path: `/v1/accounts/${id}`,
    status: 200,
  })
  return NextResponse.json(publicAccount(data))
}

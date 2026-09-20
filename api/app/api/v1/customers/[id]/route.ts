import { NextResponse } from "next/server"
import { listPlatformAccounts } from "@/lib/platform/ledger"
import { publicCustomer } from "@/lib/platform/objects"
import { logPlatformApi, requireMerchant, v1Error } from "@/lib/platform/v1"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = createSupabaseAdmin()
  const auth = await requireMerchant(admin, request, "accounts.read")
  if (!auth.ok) return auth.response
  const { id } = await ctx.params
  const livemode = auth.ctx.mode === "live"
  const { data } = await admin
    .from("platform_customers")
    .select("id, email, name, external_id, easetag, status, verification_status, livemode, created_at")
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
      path: `/v1/customers/${id}`,
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
    path: `/v1/customers/${id}`,
    status: 200,
  })
  const accounts = await listPlatformAccounts(admin, auth.ctx.businessId, livemode, {
    customerId: id,
  })
  return NextResponse.json({ ...publicCustomer(data), accounts })
}

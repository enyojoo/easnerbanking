import { NextResponse } from "next/server"
import { startPlatformCustomerVerification } from "@/lib/platform/receive"
import { logPlatformApi, requireMerchant, v1Error } from "@/lib/platform/v1"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = createSupabaseAdmin()
  const auth = await requireMerchant(admin, request, "accounts.write")
  if (!auth.ok) return auth.response
  const { id } = await ctx.params
  const livemode = auth.ctx.mode === "live"
  const body = (await request.json().catch(() => null)) as { return_url?: string } | null
  try {
    const result = await startPlatformCustomerVerification(admin, {
      businessId: auth.ctx.businessId,
      livemode,
      customerId: id,
      returnUrl: body?.return_url,
    })
    await logPlatformApi(admin, {
      startedAt: auth.ctx.startedAt,
      idempotencyKey: auth.ctx.idempotencyKey,
      businessId: auth.ctx.businessId,
      livemode,
      method: "POST",
      path: `/v1/customers/${id}/verification`,
      status: 200,
    })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start verification"
    const code = message === "Customer not found" ? "not_found" : "create_failed"
    await logPlatformApi(admin, {
      startedAt: auth.ctx.startedAt,
      idempotencyKey: auth.ctx.idempotencyKey,
      businessId: auth.ctx.businessId,
      livemode,
      method: "POST",
      path: `/v1/customers/${id}/verification`,
      status: code === "not_found" ? 404 : 400,
      errorCode: code,
    })
    return v1Error(code === "not_found" ? 404 : 400, code, message)
  }
}

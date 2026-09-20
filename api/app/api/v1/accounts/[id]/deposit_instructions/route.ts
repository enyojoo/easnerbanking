import { NextResponse } from "next/server"
import { getDepositInstructions } from "@/lib/platform/receive"
import { denyIfRestricted, logPlatformApi, requireMerchant, v1Error } from "@/lib/platform/v1"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = createSupabaseAdmin()
  const auth = await requireMerchant(admin, request, "accounts.read")
  if (!auth.ok) return auth.response
  const restricted = await denyIfRestricted(admin, auth.ctx.businessId, "deposit")
  if (restricted) return restricted
  const { id } = await ctx.params
  const livemode = auth.ctx.mode === "live"
  try {
    const details = await getDepositInstructions(admin, {
      businessId: auth.ctx.businessId,
      livemode,
      accountId: id,
    })
    await logPlatformApi(admin, {
      startedAt: auth.ctx.startedAt,
      businessId: auth.ctx.businessId,
      livemode,
      method: "GET",
      path: `/v1/accounts/${id}/deposit_instructions`,
      status: 200,
    })
    return NextResponse.json(details)
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : error instanceof Error && error.message === "Account not found"
          ? "not_found"
          : "create_failed"
    const status = code === "verification_required" ? 403 : code === "not_found" ? 404 : code === "not_available" ? 409 : 400
    await logPlatformApi(admin, {
      startedAt: auth.ctx.startedAt,
      businessId: auth.ctx.businessId,
      livemode,
      method: "GET",
      path: `/v1/accounts/${id}/deposit_instructions`,
      status,
      errorCode: code,
    })
    return v1Error(status, code, error instanceof Error ? error.message : "Could not load deposit instructions")
  }
}

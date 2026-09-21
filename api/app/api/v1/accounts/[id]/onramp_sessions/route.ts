import { NextResponse } from "next/server"
import { createPlatformOnrampSession } from "@/lib/platform/receive"
import { denyIfRestricted, logPlatformApi, parseMinorAmount, requireMerchant, v1Error } from "@/lib/platform/v1"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = createSupabaseAdmin()
  const auth = await requireMerchant(admin, request, "accounts.write")
  if (!auth.ok) return auth.response
  const restricted = await denyIfRestricted(admin, auth.ctx.businessId, "deposit")
  if (restricted) return restricted
  const { id } = await ctx.params
  const livemode = auth.ctx.mode === "live"
  const body = (await request.json().catch(() => null)) as {
    amount?: number
    currency?: string
    return_url?: string
  } | null
  const amount = parseMinorAmount(body?.amount)
  if (!amount) return v1Error(400, "invalid_amount", "amount must be a positive integer in cents")
  try {
    const session = await createPlatformOnrampSession(admin, {
      businessId: auth.ctx.businessId,
      livemode,
      accountId: id,
      amountCents: amount,
      currency: body?.currency,
      returnUrl: body?.return_url,
    })
    await logPlatformApi(admin, {
      startedAt: auth.ctx.startedAt,
      idempotencyKey: auth.ctx.idempotencyKey,
      businessId: auth.ctx.businessId,
      livemode,
      method: "POST",
      path: `/v1/accounts/${id}/onramp_sessions`,
      status: 201,
    })
    return NextResponse.json(session, { status: 201 })
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : error instanceof Error && error.message === "Account not found"
          ? "not_found"
          : "create_failed"
    const status = code === "verification_required" ? 403 : code === "not_found" ? 404 : 400
    await logPlatformApi(admin, {
      startedAt: auth.ctx.startedAt,
      idempotencyKey: auth.ctx.idempotencyKey,
      businessId: auth.ctx.businessId,
      livemode,
      method: "POST",
      path: `/v1/accounts/${id}/onramp_sessions`,
      status,
      errorCode: code,
    })
    return v1Error(status, code, error instanceof Error ? error.message : "Could not create onramp session")
  }
}

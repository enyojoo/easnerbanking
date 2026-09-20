import { NextResponse } from "next/server"
import { cancelPlatformTransfer, platformTransferHttpError } from "@/lib/platform/transfer-authorize"
import { logPlatformApi, requireMerchant, v1Error } from "@/lib/platform/v1"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = createSupabaseAdmin()
  const auth = await requireMerchant(admin, request, "transfers.write")
  if (!auth.ok) return auth.response
  const { id } = await ctx.params
  const livemode = auth.ctx.mode === "live"
  try {
    const transfer = await cancelPlatformTransfer(admin, {
      businessId: auth.ctx.businessId,
      livemode,
      transferId: id,
    })
    await logPlatformApi(admin, {
      businessId: auth.ctx.businessId,
      livemode,
      method: "POST",
      path: `/v1/transfers/${id}/cancel`,
      status: 200,
    })
    return NextResponse.json(transfer)
  } catch (error) {
    const mapped = platformTransferHttpError(error)
    await logPlatformApi(admin, {
      businessId: auth.ctx.businessId,
      livemode,
      method: "POST",
      path: `/v1/transfers/${id}/cancel`,
      status: mapped.status,
      errorCode: mapped.code,
    })
    return v1Error(mapped.status, mapped.code, mapped.message)
  }
}

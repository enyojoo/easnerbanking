import { NextResponse } from "next/server"
import { redeliverMerchantWebhook } from "@/lib/checkout/merchant-webhooks"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

/** Re-send one recorded webhook delivery to the currently configured endpoint. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const { id } = await context.params
  const admin = createSupabaseAdmin()
  const result = await redeliverMerchantWebhook(admin, {
    businessId: ctx.businessId,
    deliveryId: id,
  })

  if (!result.found) {
    return NextResponse.json({ error: "Delivery not found" }, { status: 404 })
  }
  if (!result.delivered) {
    return NextResponse.json(
      {
        delivered: false,
        error:
          result.error ||
          (result.status ? `Your endpoint replied with ${result.status}.` : "Delivery failed"),
      },
      { status: 502 },
    )
  }
  return NextResponse.json({ delivered: true, status: result.status ?? 200 })
}

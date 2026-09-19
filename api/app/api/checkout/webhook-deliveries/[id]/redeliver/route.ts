import { NextResponse } from "next/server"
import { redeliverCheckoutWebhook } from "@/lib/checkout/merchant-webhooks"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const { id } = await context.params
  if (!id) return NextResponse.json({ error: "Missing delivery id" }, { status: 400 })

  const admin = createSupabaseAdmin()
  const result = await redeliverCheckoutWebhook(admin, {
    businessId: ctx.businessId,
    deliveryId: id,
  })
  if (!result.delivered) {
    return NextResponse.json(
      {
        error:
          result.error ||
          (result.status ? `Your endpoint replied ${result.status}.` : "Redelivery failed"),
      },
      { status: 400 },
    )
  }
  return NextResponse.json({ delivered: true, status: result.status ?? 200 })
}

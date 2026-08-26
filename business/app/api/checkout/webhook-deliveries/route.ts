import { NextResponse } from "next/server"
import { listCheckoutWebhookDeliveries } from "@/lib/checkout/merchant-webhooks"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const deliveries = await listCheckoutWebhookDeliveries(admin, ctx.businessId)
  return NextResponse.json({ deliveries })
}

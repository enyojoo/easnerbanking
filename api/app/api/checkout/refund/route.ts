import { NextResponse } from "next/server"
import { refundCheckoutPayment } from "@/lib/stripe/refund-checkout-payment"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

/** Full refund of a Payment Link or website checkout payment. */
export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const body = (await request.json().catch(() => null)) as { settlement_id?: string } | null
  const settlementId = String(body?.settlement_id ?? "").trim()
  if (!settlementId) {
    return NextResponse.json({ error: "settlement_id required" }, { status: 400 })
  }

  const result = await refundCheckoutPayment(createSupabaseAdmin(), {
    businessId: ctx.businessId,
    settlementId,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ refundId: result.refundId, status: result.status })
}

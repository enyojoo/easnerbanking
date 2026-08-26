import { NextResponse } from "next/server"
import { dispatchMerchantWebhook } from "@/lib/checkout/merchant-webhooks"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

/** Send a sample `checkout.completed` event so merchants can verify their endpoint. */
export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const result = await dispatchMerchantWebhook(admin, {
    businessId: ctx.businessId,
    event: "checkout.completed",
    data: {
      test: true,
      checkout_session_id: "cs_test_easner_sample",
      mode: "payment",
      amount_cents: 4900,
      currency: "USD",
      customer_email: "customer@example.com",
      subscription_id: null,
      metadata: { order_id: "ord_test" },
      paid_at: new Date().toISOString(),
      livemode: false,
    },
  })

  if (!result.delivered) {
    return NextResponse.json(
      {
        error:
          result.error ||
          (result.status
            ? `Your endpoint replied with ${result.status}.`
            : "Add an endpoint URL and signing secret first."),
      },
      { status: 400 },
    )
  }

  return NextResponse.json({ delivered: true, status: result.status ?? 200 })
}

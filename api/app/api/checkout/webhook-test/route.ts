import { NextResponse } from "next/server"
import { MERCHANT_WEBHOOK_EVENTS, type MerchantWebhookEvent, sendTestWebhook } from "@/lib/checkout/merchant-webhooks"
import { buildSampleWebhookPayload } from "@/lib/checkout/sample-webhook-payloads"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

/** Send a sample event to a specific endpoint so merchants can verify it. */
export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const body = (await request.json().catch(() => null)) as { endpointId?: string; event?: string } | null
  const endpointId = body?.endpointId
  if (!endpointId) return NextResponse.json({ error: "Choose an endpoint to test" }, { status: 400 })

  const allowed = new Set<string>(MERCHANT_WEBHOOK_EVENTS)
  const event = (allowed.has(String(body?.event)) ? body?.event : "checkout.completed") as MerchantWebhookEvent

  const admin = createSupabaseAdmin()
  const result = await sendTestWebhook(admin, {
    businessId: ctx.businessId,
    endpointId,
    event,
    data: buildSampleWebhookPayload(event),
  })

  if (!result.delivered) {
    return NextResponse.json(
      {
        error:
          result.error ||
          (result.status ? `Your endpoint replied with ${result.status}.` : "Add an endpoint URL and signing secret first."),
      },
      { status: 400 },
    )
  }

  return NextResponse.json({ delivered: true, status: result.status ?? 200 })
}

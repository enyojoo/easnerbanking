import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { processPendingMerchantWebhookDeliveries } from "@/lib/checkout/merchant-webhooks"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

/** Cron: retry pending merchant webhook deliveries whose backoff has elapsed. */
export async function GET(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createSupabaseAdmin()
  const summary = await processPendingMerchantWebhookDeliveries(admin, { limit: 100 })
  return NextResponse.json(summary)
}

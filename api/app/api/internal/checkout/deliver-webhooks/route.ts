import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { retryDueCheckoutWebhooks } from "@/lib/checkout/merchant-webhooks"
import { createSupabaseAdmin } from "@/lib/supabase/admin"

export async function GET(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createSupabaseAdmin()
  const result = await retryDueCheckoutWebhooks(admin)
  return NextResponse.json({ ok: true, ...result })
}

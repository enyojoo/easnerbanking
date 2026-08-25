import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

/** Recent outbound webhook deliveries for the merchant's endpoint. */
export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const { data: rows, error } = await admin
    .from("merchant_webhook_deliveries")
    .select(
      "id, event, status, attempts, last_attempt_at, next_retry_at, response_status, last_error, delivered_at, created_at",
    )
    .eq("business_id", ctx.businessId)
    .order("created_at", { ascending: false })
    .limit(50)

  // Table missing (migration pending) reads as an empty history, not an error page.
  return NextResponse.json({ deliveries: error ? [] : rows ?? [] })
}

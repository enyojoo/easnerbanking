import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response
  const { id } = await context.params

  const admin = createSupabaseAdmin()
  const { data: event } = await admin
    .from("platform_events")
    .select("id, type, payload, livemode, created_at")
    .eq("id", id)
    .eq("business_id", ctx.businessId)
    .maybeSingle()

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 })

  const { data: deliveries } = await admin
    .from("platform_webhook_deliveries")
    .select("id, endpoint_id, status, attempt_count, last_status_code, last_error, delivered_at, created_at")
    .eq("event_id", id)
    .order("created_at", { ascending: false })

  return NextResponse.json({ event, deliveries: deliveries ?? [] })
}

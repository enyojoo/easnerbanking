import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

const PAGE_SIZE = 50

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const params = new URL(request.url).searchParams
  const livemode = params.get("livemode") === "live"
  const type = params.get("type")
  const cursor = params.get("cursor")

  const admin = createSupabaseAdmin()
  let query = admin
    .from("platform_events")
    .select("id, type, payload, created_at")
    .eq("business_id", ctx.businessId)
    .eq("livemode", livemode)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE)

  if (type) query = query.eq("type", type)
  if (cursor) query = query.lt("created_at", cursor)

  const { data } = await query
  const events = data ?? []
  const nextCursor = events.length === PAGE_SIZE ? events[events.length - 1].created_at : null

  return NextResponse.json({ events, nextCursor })
}

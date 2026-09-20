import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const livemode = new URL(request.url).searchParams.get("livemode") === "live"
  const admin = createSupabaseAdmin()
  const { data } = await admin
    .from("platform_api_logs")
    .select("id, method, path, status, error_code, created_at")
    .eq("business_id", ctx.businessId)
    .eq("livemode", livemode)
    .order("created_at", { ascending: false })
    .limit(50)

  return NextResponse.json({ logs: data ?? [] })
}

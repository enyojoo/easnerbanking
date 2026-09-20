import { NextResponse } from "next/server"
import { publicCustomer } from "@/lib/platform/objects"
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
    .from("platform_customers")
    .select("id, email, name, external_id, status, livemode, created_at")
    .eq("business_id", ctx.businessId)
    .eq("livemode", livemode)
    .order("created_at", { ascending: false })
    .limit(100)
  return NextResponse.json({
    customers: (data ?? []).map((row) => publicCustomer(row)),
  })
}

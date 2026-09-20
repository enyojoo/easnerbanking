import { NextResponse } from "next/server"
import { listPlatformAccounts } from "@/lib/platform/ledger"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireEasnerBusinessId } from "@/lib/terminal/context"

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response
  const livemode = new URL(request.url).searchParams.get("livemode") === "live"
  const admin = createSupabaseAdmin()
  const accounts = await listPlatformAccounts(admin, ctx.businessId, livemode)
  return NextResponse.json({ accounts })
}

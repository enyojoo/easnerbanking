import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { processPendingLiquiditySweepJobs } from "@/lib/liquidity/sweep-jobs"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const status = msg === "Unauthorized" ? 401 : 500
    return NextResponse.json({ error: msg }, { status })
  }

  const admin = createSupabaseAdmin()
  const result = await processPendingLiquiditySweepJobs(admin, { limit: 10 })
  return NextResponse.json({ ok: true, ...result })
}

export async function GET(request: Request) {
  return POST(request)
}

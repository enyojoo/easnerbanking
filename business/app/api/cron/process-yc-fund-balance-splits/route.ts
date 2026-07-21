import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { processStuckYcFundBalanceSplits } from "@/lib/yellowcard/process-stuck-yc-fund-balance-splits"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized"
    return NextResponse.json({ ok: false, error: msg }, { status: 401 })
  }

  const admin = createSupabaseAdmin()
  const result = await processStuckYcFundBalanceSplits(admin, { limit: 25, olderThanMs: 90_000 })

  return NextResponse.json({ ok: true, ...result })
}

export async function POST(request: Request) {
  return GET(request)
}

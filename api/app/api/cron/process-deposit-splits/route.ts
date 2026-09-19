import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { processStuckDepositSplitJobs } from "@/lib/deposit-omnibus/execute-deposit-split"
import { isDepositSplitConfigValid, isDepositSplitEnabled } from "@/lib/deposit-omnibus/config"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized"
    return NextResponse.json({ ok: false, error: msg }, { status: 401 })
  }

  if (!isDepositSplitEnabled()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "split_disabled" })
  }

  if (!isDepositSplitConfigValid()) {
    return NextResponse.json(
      { ok: false, error: "DEPOSIT_SPLIT_ENABLED requires DEPOSIT_OMNIBUS_ENABLED" },
      { status: 500 },
    )
  }

  const admin = createSupabaseAdmin()
  const result = await processStuckDepositSplitJobs(admin, { limit: 25, olderThanMs: 90_000 })

  return NextResponse.json({ ok: true, ...result })
}

export async function POST(request: Request) {
  return GET(request)
}

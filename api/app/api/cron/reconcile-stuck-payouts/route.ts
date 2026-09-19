import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { reconcileStuckPayouts } from "@/lib/reconciliation/reconcile-stuck-payouts"

export const runtime = "nodejs"
export const maxDuration = 300

/** Catch up stuck payouts when provider webhooks fail or arrive late. */
export async function GET(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized"
    return NextResponse.json({ ok: false, error: msg }, { status: 401 })
  }

  const url = new URL(request.url)
  const days = Math.min(30, Math.max(1, Number.parseInt(url.searchParams.get("days") ?? "7", 10)))
  const minAgeMinutes = Math.min(
    60,
    Math.max(1, Number.parseInt(url.searchParams.get("minAgeMinutes") ?? "5", 10)),
  )

  const admin = createSupabaseAdmin()
  const result = await reconcileStuckPayouts(admin, {
    sinceDays: days,
    minAgeMinutes,
  })

  return NextResponse.json({ ok: true, days, minAgeMinutes, ...result })
}

export async function POST(request: Request) {
  return GET(request)
}

import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  scheduleAccountDeletion,
} from "@/lib/settings/account-deletion"

/**
 * Self-serve account closure for the currently authenticated user.
 *
 * - Auth: Bearer access token (mobile/web).
 * - Behavior: Schedules account closure after a 7-day grace period.
 *   Profile and financial records are retained; only login access is revoked after grace.
 *   Signing back in cancels the pending closure.
 * - Final closure is performed by `/api/cron/process-account-deletions`.
 */
export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createSupabaseAdmin()

  try {
    const { deletion_scheduled_at } = await scheduleAccountDeletion(admin, user.id)
    return NextResponse.json({
      ok: true,
      grace_days: ACCOUNT_DELETION_GRACE_DAYS,
      deletion_scheduled_at,
    })
  } catch (e) {
    console.error("delete-account: unexpected", e)
    const msg = e instanceof Error ? e.message : "Unable to schedule account closure."
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

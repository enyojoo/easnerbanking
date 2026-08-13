import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { syncGridPayoutCorridorsSafe } from "@/lib/fx/grid-corridor-sync"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"

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
  const result = await syncGridPayoutCorridorsSafe(admin)
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "grid_corridor_sync_failed" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    targets: result.targets,
    inserted: result.inserted,
    updated: result.updated,
    skipped: result.skipped,
    orphans_disabled: result.pruned,
    realigned: result.realigned ?? 0,
    flags_cleared: result.flagsCleared ?? 0,
  })
}

export async function POST(request: Request) {
  return GET(request)
}

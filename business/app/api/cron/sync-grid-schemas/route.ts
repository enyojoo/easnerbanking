import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { syncGridCorridorSchemasSafe } from "@/lib/fx/grid-schema-sync"
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
  const result = await syncGridCorridorSchemasSafe(admin)
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "grid_schema_sync_failed" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    updated: result.updated,
    skipped: result.skipped,
  })
}

export async function POST(request: Request) {
  return GET(request)
}

import { NextResponse } from "next/server"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { syncGridCorridorSchemasSafe } from "@/lib/fx/grid-schema-sync"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

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

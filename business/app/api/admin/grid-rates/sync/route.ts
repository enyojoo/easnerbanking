import { NextResponse } from "next/server"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { syncGridRatesSafe } from "@/lib/fx/grid-rate-sync"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const result = await syncGridRatesSafe()
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "grid_rate_sync_failed" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    upserted: result.upserted,
    skipped: result.skipped,
  })
}

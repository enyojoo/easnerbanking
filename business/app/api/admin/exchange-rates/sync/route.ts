import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { ensureReportingFxMatrix } from "@/lib/admin/rates-service"
import { syncReportingFxRatesSafe } from "@/lib/fx/p2p-rate-sync"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const admin = createSupabaseAdmin()
  try {
    await ensureReportingFxMatrix(admin)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to bootstrap reporting FX matrix" },
      { status: 500 },
    )
  }

  const result = await syncReportingFxRatesSafe()
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 500 })
  }

  const { updated, skipped, pairs, skippedPairs } = result.result
  return NextResponse.json({
    ok: true,
    updated,
    skipped,
    pairs: pairs.slice(0, 30),
    skippedPairs: skippedPairs.slice(0, 30),
  })
}

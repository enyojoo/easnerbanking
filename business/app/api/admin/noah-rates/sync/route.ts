import { NextResponse } from "next/server"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { syncNoahRatesSafe } from "@/lib/fx/noah-rate-sync"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const result = await syncNoahRatesSafe({ seedMissing: true })
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

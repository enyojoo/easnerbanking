import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { syncYcRatesSafe } from "@/lib/fx/yc-rate-sync"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized"
    return NextResponse.json({ ok: false, error: msg }, { status: 401 })
  }

  const result = await syncYcRatesSafe()
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason }, { status: 500 })
  }

  const { updated, skipped, pairs, skippedPairs } = result.result
  return NextResponse.json({
    ok: true,
    updated,
    skipped,
    pairs: pairs.slice(0, 20),
    skippedPairs: skippedPairs.slice(0, 20),
  })
}

export async function POST(request: Request) {
  return GET(request)
}

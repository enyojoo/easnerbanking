import { NextResponse } from "next/server"
import { syncExchangeRatesFromModel } from "@easner/rate-sync"
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

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json(
      { ok: false, error: "supabase_not_configured" },
      { status: 500 },
    )
  }

  try {
    const result = await syncExchangeRatesFromModel({
      supabaseUrl: url,
      serviceRoleKey: key,
    })
    return NextResponse.json({
      ok: true,
      updated: result.updated,
      skipped: result.skipped,
      pairs: result.pairs.slice(0, 20),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return GET(request)
}

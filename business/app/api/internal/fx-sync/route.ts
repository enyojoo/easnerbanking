import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { assertFxSyncAuthorized, syncOpenExchangeRates } from "@/lib/fx/exchange-rates"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    assertFxSyncAuthorized(request)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized"
    return NextResponse.json({ ok: false, error: msg }, { status: 401 })
  }

  const admin = createSupabaseAdmin()
  const result = await syncOpenExchangeRates(admin)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason }, { status: 400 })
  }
  return NextResponse.json({ ok: true, asOf: result.asOf, updated: result.updated })
}

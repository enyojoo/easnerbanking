import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { processDueAccountClosures } from "@/lib/settings/account-deletion"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized"
    return NextResponse.json({ ok: false, error: msg }, { status: 401 })
  }

  try {
    const admin = createSupabaseAdmin()
    const result = await processDueAccountClosures(admin)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error("process-account-deletions:", e)
    const msg = e instanceof Error ? e.message : "Unable to process account closures."
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return GET(request)
}

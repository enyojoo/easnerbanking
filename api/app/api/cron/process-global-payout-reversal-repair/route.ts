import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { repairGlobalPayoutsFailedWithoutReversal } from "@/lib/noah/global-payout-ledger"

export const runtime = "nodejs"
export const maxDuration = 120

/** Retry wallet debit reversals for failed global fiat payouts. */
export async function GET(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized"
    return NextResponse.json({ ok: false, error: msg }, { status: 401 })
  }

  const admin = createSupabaseAdmin()
  const result = await repairGlobalPayoutsFailedWithoutReversal(admin, { limit: 50 })

  return NextResponse.json({
    ok: true,
    attempted: result.attempted,
    repaired: result.repaired,
    still_stuck: result.stillStuck.length,
    sample_stuck_ids: result.stillStuck.slice(0, 5).map((r) => r.transactionId),
  })
}

export async function POST(request: Request) {
  return GET(request)
}

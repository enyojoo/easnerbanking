import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { reconcileAllRelaySettlements } from "@/lib/relay/process-relay-webhook"

export const runtime = "nodejs"

async function runRelaySettlementReconcile() {
  const admin = createSupabaseAdmin()
  const result = await reconcileAllRelaySettlements(admin)
  return NextResponse.json({ ok: true, ...result })
}

function unauthorizedResponse(e: unknown): NextResponse<{ error: string }> {
  const msg = e instanceof Error ? e.message : String(e)
  const status = msg === "Unauthorized" ? 401 : 500
  return NextResponse.json({ error: msg }, { status })
}

/** Poll Relay v3 and complete settlements missed by webhooks (deposits, converts, wallet sends). */
export async function POST(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch (e) {
    return unauthorizedResponse(e)
  }
  return runRelaySettlementReconcile()
}

export async function GET(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch (e) {
    return unauthorizedResponse(e)
  }
  return runRelaySettlementReconcile()
}

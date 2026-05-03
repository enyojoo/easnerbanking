import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { resolveNoahContextAsync } from "@/lib/noah/resolve-noah-context"

export const runtime = "nodejs"

/**
 * Reserve a globally unique `ETID` + 8 digits for display before submit; consumed when
 * `transfer_easetag_p2p` posts the debit leg (or expires ~15m).
 *
 * **Business scope** (`X-Easner-Noah-Scope: business`): must match `transfer_easetag_p2p` sender scope
 * or `reserved_debit_etid_not_found` — same pattern as mobile `reserveEasnerTransactionId` + scope headers.
 */
export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const noahCtx = await resolveNoahContextAsync(user.id, request)
  if (!noahCtx.ok) return noahCtx.response

  const admin = createSupabaseAdmin()
  const rpcPayload =
    noahCtx.scope === "business" && noahCtx.businessId
      ? { p_user_id: user.id, p_sender_business_id: noahCtx.businessId }
      : { p_user_id: user.id }

  const { data, error } = await admin.rpc("reserve_easner_transaction_id", rpcPayload)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const easner_transaction_id = typeof data === "string" ? data.trim() : ""
  if (!easner_transaction_id) {
    return NextResponse.json({ error: "reserve_failed" }, { status: 502 })
  }

  return NextResponse.json({ easner_transaction_id })
}

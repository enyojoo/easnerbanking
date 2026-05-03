import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"

export const runtime = "nodejs"

/**
 * Reserve a globally unique `ETID` + 8 digits for display before submit; consumed when
 * `transfer_easetag_p2p` posts the debit leg (or expires ~15m).
 *
 * DB function today: `reserve_easner_transaction_id(p_user_id uuid)` only — do not pass
 * extra args until a migration adds an org-scoped overload (otherwise PostgREST returns
 * "Could not find the function … in the schema cache").
 */
export async function POST(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createSupabaseAdmin()
  const { data, error } = await admin.rpc("reserve_easner_transaction_id", {
    p_user_id: user.id,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const easner_transaction_id = typeof data === "string" ? data.trim() : ""
  if (!easner_transaction_id) {
    return NextResponse.json({ error: "reserve_failed" }, { status: 502 })
  }

  return NextResponse.json({ easner_transaction_id })
}

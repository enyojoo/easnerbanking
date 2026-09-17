import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { loadOfficeTransactionDetail } from "@/lib/admin/office-transaction-detail"

type Props = { params: Promise<{ transactionId: string }> }

/**
 * Office ledger detail: one transaction, customer-facing snapshots, ops ids, related legs.
 */
export async function GET(request: Request, routeCtx: Props) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const { transactionId: rawId } = await routeCtx.params
  const transactionId = String(rawId || "").trim()
  if (!transactionId) {
    return NextResponse.json({ error: "Missing transaction id" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const loaded = await loadOfficeTransactionDetail(admin, decodeURIComponent(transactionId))
  if (loaded.error || !loaded.detail) {
    return NextResponse.json({ error: loaded.error?.message || "Not found" }, { status: loaded.status })
  }
  return NextResponse.json(loaded.detail)
}

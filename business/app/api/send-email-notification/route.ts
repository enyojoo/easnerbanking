import { NextResponse } from "next/server"
import { EmailNotificationService } from "@easner/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

/**
 * - `type: admin-transaction` — office staff, or the transaction owner (Bearer) notifying ops.
 * - `type: transaction` (default) — user JWT must own the transaction, **or** office staff.
 */
export async function POST(request: Request) {
  let body: { type?: string; transactionId?: string; status?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const type = body.type ?? "transaction"
  const txId = body.transactionId
  if (!txId) {
    return NextResponse.json({ error: "transactionId required" }, { status: 400 })
  }

  const status = body.status ?? ""
  if (!status) {
    return NextResponse.json({ error: "status required" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()

  let { data: tx } = await admin
    .from("transactions")
    .select("user_id, transaction_id, status")
    .eq("id", txId)
    .maybeSingle()
  if (!tx) {
    const second = await admin
      .from("transactions")
      .select("user_id, transaction_id, status")
      .eq("transaction_id", txId)
      .maybeSingle()
    tx = second.data
  }
  if (!tx?.user_id) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
  }

  const user = await getUserFromApiRequest(request)
  const ownerOk = !!(user && user.id === tx.user_id)

  if (type === "admin-transaction") {
    if (ownerOk) {
      await EmailNotificationService.sendAdminTransactionNotification(txId, status)
      return NextResponse.json({ success: true })
    }
    const auth = await requireOfficeAdmin(request)
    if (!auth.ok) return auth.response
    await EmailNotificationService.sendAdminTransactionNotification(txId, status)
    return NextResponse.json({ success: true })
  }

  if (ownerOk) {
    await EmailNotificationService.sendTransactionStatusEmail(txId, status)
    return NextResponse.json({ success: true })
  }

  const adminAuth = await requireOfficeAdmin(request)
  if (adminAuth.ok) {
    await EmailNotificationService.sendTransactionStatusEmail(txId, status)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({
    error: "Unauthorized — sign in or use office staff access.",
  }, { status: 401 })
}

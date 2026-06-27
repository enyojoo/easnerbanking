import { NextResponse } from "next/server"
import { EmailNotificationService } from "@easner/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"

/**
 * - `type: admin-transaction` — office staff, or the transaction owner (Bearer) notifying ops.
 * - `type: transaction` (default) — **deprecated**; ledger dispatch sends user transaction emails.
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

  if (type === "transaction") {
    return NextResponse.json(
      {
        deprecated: true,
        error:
          "User transaction status emails are deprecated. Notifications are sent from ledger dispatch.",
      },
      { status: 410 },
    )
  }

  if (type !== "admin-transaction") {
    return NextResponse.json({ error: "Unknown type" }, { status: 400 })
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

  if (ownerOk) {
    await EmailNotificationService.sendAdminTransactionNotification(txId, status)
    return NextResponse.json({ success: true })
  }

  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  await EmailNotificationService.sendAdminTransactionNotification(txId, status)
  return NextResponse.json({ success: true })
}

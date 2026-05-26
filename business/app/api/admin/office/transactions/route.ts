import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { requireOfficeAdmin } from "@/lib/api/admin-auth"
import { loadOfficeLedgerTransactions } from "@/lib/admin/office-load-transactions"

/**
 * Office ledger: list provider transactions (service role). Optional `userId` filter.
 */
export async function GET(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const userId = url.searchParams.get("userId")?.trim() || undefined
  const limitRaw = Number(url.searchParams.get("limit") || "200")
  const limit = Number.isFinite(limitRaw) ? limitRaw : 200

  const admin = createSupabaseAdmin()
  const { data, error } = await loadOfficeLedgerTransactions(admin, { userId, limit })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ transactions: data })
}

/**
 * Manual status override from office (legacy ops flow).
 */
export async function PATCH(request: Request) {
  const auth = await requireOfficeAdmin(request)
  if (!auth.ok) return auth.response

  let body: { transactionId?: string; status?: string }
  try {
    body = (await request.json()) as { transactionId?: string; status?: string }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const transactionId = String(body.transactionId || "").trim()
  const status = String(body.status || "").trim()
  if (!transactionId || !status) {
    return NextResponse.json({ error: "transactionId and status are required" }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { error } = await admin
    .from("transactions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", transactionId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { mapNoahTransactionToMobileDetail } from "@/lib/noah/map-transactions"
import { resolveLedgerListScope } from "@/lib/transactions-ledger-scope"

const LEDGER_SELECT =
  "id, status, amount, currency, direction, metadata, payload, noah_transaction_id, created_at, updated_at"

function mapLedgerRowToMobileItem(row: Record<string, unknown>): Record<string, unknown> {
  const dirRaw = String(row.direction ?? "").toLowerCase()
  const transaction_type = dirRaw === "in" ? "receive" : "send"
  const st = String(row.status ?? "").toLowerCase()
  const status =
    st === "settled" ? "completed"
    : st === "pending" || st === "processing" ? st
    : st === "failed" || st === "cancelled" ? "failed"
    : st === "unknown" ? "pending"
    : st || "unknown"
  const created = row.created_at != null ? String(row.created_at) : new Date().toISOString()
  const noahId = row.noah_transaction_id != null ? String(row.noah_transaction_id) : ""
  const ledgerId = row.id != null ? String(row.id) : ""
  const idForUi = noahId || ledgerId
  const amount = typeof row.amount === "number" ? row.amount : Number(row.amount) || 0
  const currency = String(row.currency ?? "USD")
  const name = transaction_type === "receive" ? "Bank Deposit" : "Sent"
  return {
    id: idForUi,
    transaction_id: idForUi,
    type: transaction_type,
    transaction_type,
    amount,
    currency,
    status,
    created_at: created,
    noah_created_at: created,
    name,
    direction: dirRaw === "in" ? "credit" : "debit",
    source_type: undefined,
    metadata: row.metadata,
  }
}

function mapLedgerRowToMobileDetail(row: Record<string, unknown>): Record<string, unknown> {
  const base = mapLedgerRowToMobileItem(row)
  const noahId = row.noah_transaction_id != null ? String(row.noah_transaction_id) : ""
  const dirRaw = String(row.direction ?? "").toLowerCase()
  const st = String(row.status ?? "").toLowerCase()
  const created = row.created_at != null ? String(row.created_at) : new Date().toISOString()
  return {
    ...base,
    noah_transaction_id: noahId || undefined,
    final_amount: base.amount,
    updated_at: created,
    completed_at: st === "settled" ? created : undefined,
    source_payment_rail: "ach",
    destination_payment_rail: dirRaw === "in" ? "bank" : "crypto",
  }
}

type Props = { params: Promise<{ transactionId: string }> }

export async function GET(request: Request, routeCtx: Props) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = user.id

  const { transactionId: rawId } = await routeCtx.params
  const transactionId = rawId?.trim()
  if (!transactionId) {
    return NextResponse.json({ error: "Missing transaction id" }, { status: 400 })
  }

  const scopeRes = await resolveLedgerListScope(request, userId)
  if (!scopeRes.ok) return scopeRes.response
  const { scope, businessId } = scopeRes

  const admin = createSupabaseAdmin()

  function fetchOne(filter: { column: string; value: string }) {
    let q = admin
      .from("transactions")
      .select(LEDGER_SELECT)
      .eq("provider", "noah")
      .eq(filter.column, filter.value)
    if (scope === "business") {
      q = q.eq("business_id", businessId as string)
    } else {
      q = q.eq("user_id", userId).is("business_id", null)
    }
    return q.maybeSingle()
  }

  let { data: row, error } = await fetchOne({ column: "noah_transaction_id", value: transactionId })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (!row) {
    ;({ data: row, error } = await fetchOne({ column: "id", value: transactionId }))
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
  }

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const rec = row as Record<string, unknown>
  const payload = rec.payload as Record<string, unknown> | null | undefined
  let transaction: Record<string, unknown>
  if (payload && typeof payload === "object" && (payload.ID != null || payload.id != null)) {
    transaction = mapNoahTransactionToMobileDetail(payload)
  } else {
    transaction = mapLedgerRowToMobileDetail(rec)
  }

  return NextResponse.json({ transaction })
}

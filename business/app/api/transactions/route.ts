import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import type { TransactionWithSource } from "@/lib/transactions"
import { mapNoahTransactionToMobileItem } from "@/lib/noah/map-transactions"
import { resolveLedgerListScope } from "@/lib/transactions-ledger-scope"

const LEDGER_SELECT =
  "id, status, amount, currency, direction, metadata, payload, noah_transaction_id, created_at, updated_at"

function mapRowToBusinessTransaction(row: Record<string, unknown>): TransactionWithSource {
  const payload = row.payload as Record<string, unknown> | null | undefined
  const meta = row.metadata as Record<string, unknown> | null | undefined
  const dirRaw = String(row.direction ?? "").toLowerCase()
  const direction = dirRaw === "in" ? "credit" : "debit"
  const st = String(row.status ?? "").toLowerCase()
  const status =
    st === "settled" ? "completed"
    : st === "pending" || st === "processing" ? st
    : st === "failed" || st === "cancelled" ? "failed"
    : st === "unknown" ? "pending"
    : (st as "completed" | "pending" | "processing" | "failed")

  const nameFromPayload =
    payload && typeof payload === "object" ?
      String(
        (payload.FiatPayment as Record<string, unknown>)?.MerchantName ??
          payload.MerchantName ??
          payload.Network ??
          "",
      ).trim()
    : ""

  const description =
    nameFromPayload ||
    (meta?.collection_channel === "autopayout" ? "Stablecoin QR Pay" : "Stablecoin activity")

  const created = row.created_at != null ? String(row.created_at) : new Date().toISOString()

  const currencyCode = String(row.currency ?? "USD")
  const noahId = row.noah_transaction_id != null ? String(row.noah_transaction_id) : undefined
  return {
    id: String(row.id),
    type: "book" as const,
    amount: typeof row.amount === "number" ? row.amount : Number(row.amount) || 0,
    displayCurrency: currencyCode,
    description,
    date: created,
    status,
    direction,
    source: "account" as const,
    reference: noahId,
    collectionChannel:
      meta?.collection_channel != null ? String(meta.collection_channel) : undefined,
    autopayoutConfigId:
      meta?.autopayout_config_id != null ? String(meta.autopayout_config_id) : undefined,
  }
}

function mapNoahTxStatusFromLedger(st: string): string {
  const lower = st.toLowerCase()
  if (lower === "settled") return "completed"
  if (lower === "pending" || lower === "processing") return lower
  if (lower === "failed" || lower === "cancelled") return "failed"
  if (lower === "unknown") return "pending"
  return lower || "unknown"
}

/** Mobile list shape when `payload` is missing a full Noah object. */
function mapLedgerRowToMobileItem(row: Record<string, unknown>): Record<string, unknown> {
  const dirRaw = String(row.direction ?? "").toLowerCase()
  const transaction_type = dirRaw === "in" ? "receive" : "send"
  const st = mapNoahTxStatusFromLedger(String(row.status ?? ""))
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
    status: st,
    created_at: created,
    noah_created_at: created,
    name,
    direction: dirRaw === "in" ? "credit" : "debit",
    source_type: undefined,
    metadata: row.metadata,
  }
}

function mapRowToMobileTransaction(row: Record<string, unknown>): Record<string, unknown> {
  const payload = row.payload as Record<string, unknown> | null | undefined
  if (payload && typeof payload === "object" && (payload.ID != null || payload.id != null)) {
    return mapNoahTransactionToMobileItem(payload)
  }
  return mapLedgerRowToMobileItem(row)
}

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const scopeRes = await resolveLedgerListScope(request, user.id)
  if (!scopeRes.ok) return scopeRes.response
  const { scope, businessId } = scopeRes

  const limit = Math.min(
    200,
    Math.max(1, Number.parseInt(new URL(request.url).searchParams.get("limit") || "100", 10) || 100),
  )

  const admin = createSupabaseAdmin()
  let query = admin
    .from("transactions")
    .select(LEDGER_SELECT)
    .eq("provider", "noah")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (scope === "business") {
    query = query.eq("business_id", businessId as string)
  } else {
    query = query.eq("user_id", user.id).is("business_id", null)
  }

  const { data: rows, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (scope === "business") {
    const transactions = (rows ?? []).map((r) => mapRowToBusinessTransaction(r as Record<string, unknown>))
    return NextResponse.json({ transactions })
  }

  const transactions = (rows ?? []).map((r) => mapRowToMobileTransaction(r as Record<string, unknown>))
  return NextResponse.json({ transactions })
}

import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import type { TransactionWithSource } from "@/lib/transactions"
import { resolveLedgerListScope } from "@/lib/transactions-ledger-scope"
import { LEDGER_LIST_SELECT } from "@/lib/ledger/ledger-select"
import { filterSupersededPendingGlobalPayoutRows, mapLedgerRowToMobileListItem } from "@easner/shared"
import { mapRowToBusinessTransaction } from "@/lib/transactions/map-row-to-business"
import {
  applyLedgerListCursorFilter,
  buildNextLedgerListCursor,
  decodeLedgerListCursor,
} from "@/lib/transactions/ledger-list-cursor"

const DEFAULT_LIST_LIMIT = 50
const MAX_LIST_LIMIT = 100

export type LedgerListMetrics = {
  row_count: number
  response_bytes: number
  supabase_query_count: number
  duration_ms: number
}

export function logLedgerListMetrics(metrics: LedgerListMetrics): void {
  console.info("[ledger-list]", JSON.stringify(metrics))
}

export async function GET(request: Request) {
  const started = Date.now()
  let supabaseQueryCount = 0

  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const scopeRes = await resolveLedgerListScope(request, user.id)
  if (!scopeRes.ok) return scopeRes.response
  const { scope, businessId } = scopeRes

  const url = new URL(request.url)
  const limitRaw = Number.parseInt(url.searchParams.get("limit") || String(DEFAULT_LIST_LIMIT), 10)
  const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : DEFAULT_LIST_LIMIT))
  const cursor = decodeLedgerListCursor(url.searchParams.get("cursor"))

  const admin = createSupabaseAdmin()
  let query = admin
    .from("transactions")
    .select(LEDGER_LIST_SELECT)
    .eq("hidden_from_feed", false)
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1)

  if (scope === "business") {
    query = query.eq("business_id", businessId as string)
  } else {
    query = query.eq("user_id", user.id).is("business_id", null)
  }

  if (cursor) {
    query = applyLedgerListCursorFilter(query, cursor)
  }

  const { data: rows, error } = await query
  supabaseQueryCount += 1

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const rawRows = (rows ?? []) as Record<string, unknown>[]
  const dedupedRows = filterSupersededPendingGlobalPayoutRows(
    rawRows as Parameters<typeof filterSupersededPendingGlobalPayoutRows>[0],
  ) as Record<string, unknown>[]
  const { visible, nextCursor } = buildNextLedgerListCursor(dedupedRows, limit)

  let transactions: TransactionWithSource[] | Record<string, unknown>[]
  if (scope === "business") {
    transactions = visible.map((r) => mapRowToBusinessTransaction(r))
  } else {
    transactions = visible.map((r) => mapLedgerRowToMobileListItem(r))
  }

  const body = { transactions, nextCursor }
  const responseBytes = Buffer.byteLength(JSON.stringify(body), "utf8")
  logLedgerListMetrics({
    row_count: visible.length,
    response_bytes: responseBytes,
    supabase_query_count: supabaseQueryCount,
    duration_ms: Date.now() - started,
  })

  return NextResponse.json(body)
}

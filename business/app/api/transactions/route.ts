import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import type { TransactionWithSource } from "@/lib/transactions"
import { resolveLedgerListScope } from "@/lib/transactions-ledger-scope"
import { displayEasnerTransactionId } from "@/lib/easner-transaction-id"
import { LEDGER_LIST_SELECT } from "@/lib/ledger/ledger-select"
import {
  deriveBankDepositInboundDisplayLabel,
  isBankOnrampDepositFlow,
  isEasnerProductReceiveTitle,
  isVerificationDepositMetadata,
  toEasnerTransactionPrimaryLabel,
  VERIFICATION_DEPOSIT_LIST_LABEL,
} from "@easner/shared"
import { mapRowToBusinessTransaction } from "@/lib/transactions/map-row-to-business"
import { resolveGlobalPayoutOffRampDetail } from "@/lib/transactions/resolve-global-payout-off-ramp"
import { inferLedgerListSourceType } from "@/lib/transactions/ledger-list-source-type"
import {
  applyLedgerListCursorFilter,
  buildNextLedgerListCursor,
  decodeLedgerListCursor,
} from "@/lib/transactions/ledger-list-cursor"

const DEFAULT_LIST_LIMIT = 50
const MAX_LIST_LIMIT = 100

function mapNoahTxStatusFromLedger(st: string): string {
  const lower = st.toLowerCase()
  if (lower === "settled") return "completed"
  if (lower === "pending" || lower === "processing") return lower
  if (lower === "failed" || lower === "cancelled") return "failed"
  if (lower === "unknown") return "pending"
  return lower || "unknown"
}

/** Mobile list shape — metadata-only (no `payload` on list reads). */
function mapLedgerRowToMobileItem(row: Record<string, unknown>): Record<string, unknown> {
  const dirRaw = String(row.direction ?? "").toLowerCase()
  const transaction_type = dirRaw === "in" ? "receive" : "send"
  const st = mapNoahTxStatusFromLedger(String(row.status ?? ""))
  const created =
    row.occurred_at != null ? String(row.occurred_at) : row.created_at != null ? String(row.created_at) : new Date().toISOString()
  const providerTxId = row.provider_transaction_id != null ? String(row.provider_transaction_id) : ""
  const meta = row.metadata as Record<string, unknown> | null | undefined
  const easnerId = displayEasnerTransactionId({
    easnerTransactionId: row.easner_transaction_id != null ? String(row.easner_transaction_id) : null,
    metadata: meta,
    providerTransactionId: providerTxId,
    fallbackId: row.id != null ? String(row.id) : null,
  })
  const ledgerId = row.id != null ? String(row.id) : ""
  const idForUi = easnerId || providerTxId || ledgerId
  const amount = typeof row.amount === "number" ? row.amount : Number(row.amount) || 0
  const currency = String(row.currency ?? "USD")
  const ledger_row_id = ledgerId || undefined
  const isVerification = isVerificationDepositMetadata(meta)
  const bankLabel =
    !isVerification && isBankOnrampDepositFlow(meta)
      ? deriveBankDepositInboundDisplayLabel({ metadata: meta })
      : undefined
  const name = isVerification
    ? VERIFICATION_DEPOSIT_LIST_LABEL
    : bankLabel ??
      toEasnerTransactionPrimaryLabel({
        provider: String(row.provider ?? "noah"),
        direction: dirRaw === "in" ? "in" : "out",
        metadata: meta ?? null,
        payload: null,
      })
  const globalPayout = resolveGlobalPayoutOffRampDetail(row)
  const displayAmount = globalPayout?.displayAmount ?? amount
  const displayCurrency = globalPayout?.displayCurrency ?? currency
  const displayName = globalPayout?.displayDescription ?? name
  const listSenderName =
    !isVerification && bankLabel && !isEasnerProductReceiveTitle(bankLabel) ? bankLabel : undefined
  const sourceType = inferLedgerListSourceType(meta)

  return {
    id: idForUi,
    transaction_id: idForUi,
    ledger_row_id,
    type: transaction_type,
    transaction_type,
    amount: displayAmount,
    currency: displayCurrency,
    display_amount: displayAmount,
    display_currency: displayCurrency,
    display_description: displayName,
    ...(globalPayout
      ? {
          ledger_amount: globalPayout.ledgerAmount,
          ledger_currency: globalPayout.ledgerCurrency,
          display_hero_title: globalPayout.displayHeroTitle,
        }
      : {}),
    status: st,
    created_at: created,
    noah_created_at: created,
    name: displayName,
    ...(listSenderName ? { sender_display_name: listSenderName } : {}),
    direction: dirRaw === "in" ? "credit" : "debit",
    source_type: sourceType,
    metadata: row.metadata,
  }
}

function mapRowToMobileTransaction(row: Record<string, unknown>): Record<string, unknown> {
  return mapLedgerRowToMobileItem(row)
}

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
  const { visible, nextCursor } = buildNextLedgerListCursor(rawRows, limit)

  let transactions: TransactionWithSource[] | Record<string, unknown>[]
  if (scope === "business") {
    transactions = visible.map((r) => mapRowToBusinessTransaction(r))
  } else {
    transactions = visible.map((r) => mapRowToMobileTransaction(r))
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

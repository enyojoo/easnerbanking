import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import type { TransactionWithSource } from "@/lib/transactions"
import { resolveLedgerListScope } from "@/lib/transactions-ledger-scope"
import { displayEasnerTransactionId } from "@/lib/easner-transaction-id"
import { toEasnerTransactionPrimaryLabel } from "@easner/shared"
import { mapRowToBusinessTransaction } from "@/lib/transactions/map-row-to-business"
import {
  isTurnkeyNoahBankOnrampChainMirror,
  isTurnkeyTransactionHiddenFromFeed,
} from "@/lib/transactions/transaction-feed-filters"
import { collectNoahBankOnrampOnChainTxHashesForScope } from "@/lib/noah/noah-bank-onramp-chain-suppression"

const LEDGER_SELECT =
  "id, easner_transaction_id, provider, provider_transaction_id, status, amount, currency, direction, metadata, payload, created_at, updated_at, occurred_at, settled_at, tx_hash, wallet_address, counterparty_address, asset, chain, base_currency, base_amount"

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
  /** Supabase row id — use for `/api/transactions/[id]` when `id` / `transaction_id` are display-only (e.g. ETID…). */
  const ledger_row_id = ledgerId || undefined
  const name = toEasnerTransactionPrimaryLabel({
    provider: String(row.provider ?? "noah"),
    direction: dirRaw === "in" ? "in" : "out",
    metadata: (row.metadata as Record<string, unknown> | null | undefined) ?? null,
    payload: row.payload as Record<string, unknown> | null | undefined,
  })
  return {
    id: idForUi,
    transaction_id: idForUi,
    ledger_row_id,
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
    .order("occurred_at", { ascending: false, nullsFirst: false })
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

  const rawRows = (rows ?? []) as Record<string, unknown>[]
  const rowsAfterMetadataFilter = rawRows.filter(
    (r) => !isTurnkeyTransactionHiddenFromFeed(r.metadata, r.payload),
  )

  const turnkeyInboundHashes = rowsAfterMetadataFilter
    .filter((r) => String(r.provider ?? "").toLowerCase() === "turnkey" && String(r.direction ?? "").toLowerCase() === "in")
    .map((r) => String(r.tx_hash ?? "").trim())
    .filter(Boolean)
  const noahOnChainHashes =
    turnkeyInboundHashes.length > 0
      ? await collectNoahBankOnrampOnChainTxHashesForScope(admin, turnkeyInboundHashes, {
          userId: user.id,
          businessId: scope === "business" ? (businessId as string) : null,
        })
      : new Set<string>()

  const rowsFiltered = rowsAfterMetadataFilter.filter(
    (r) => !isTurnkeyNoahBankOnrampChainMirror(r, noahOnChainHashes),
  )

  if (scope === "business") {
    const transactions = rowsFiltered.map((r) => mapRowToBusinessTransaction(r))
    return NextResponse.json({ transactions })
  }

  const transactions = rowsFiltered.map((r) => mapRowToMobileTransaction(r))
  return NextResponse.json({ transactions })
}

import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import type { TransactionWithSource } from "@/lib/transactions"
import { mapNoahTransactionToMobileItem } from "@/lib/noah/map-transactions"
import { resolveLedgerListScope } from "@/lib/transactions-ledger-scope"
import { displayEasnerTransactionId } from "@/lib/easner-transaction-id"

const LEDGER_SELECT =
  "id, easner_transaction_id, provider, provider_transaction_id, status, amount, currency, direction, metadata, payload, created_at, updated_at, occurred_at, settled_at, tx_hash, wallet_address, counterparty_address, asset, chain, base_currency, base_amount"

function toProductTransactionLabel(input: {
  provider: string
  direction: "in" | "out"
  metadata?: Record<string, unknown> | null
}): string {
  const provider = input.provider.toLowerCase()
  const direction = input.direction
  const collectionChannel = String(input.metadata?.collection_channel ?? "").toLowerCase()
  const isStablecoin = provider === "turnkey" || collectionChannel === "autopayout"
  if (isStablecoin) {
    return direction === "in" ? "Stablecoin Deposit" : "Stablecoin Transfer"
  }
  return direction === "in" ? "Bank Deposit" : "Bank Transfer"
}

function deriveCounterpartyName(input: {
  metadata?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
}): string | undefined {
  const meta = input.metadata || {}
  const payload = input.payload || {}
  const candidates: unknown[] = [
    meta.counterparty_name,
    meta.recipient_name,
    meta.sender_name,
    meta.originator_name,
    meta.beneficiary_name,
    (meta.source as Record<string, unknown> | undefined)?.sender_name,
    (meta.source as Record<string, unknown> | undefined)?.originator_name,
    (meta.destination as Record<string, unknown> | undefined)?.recipient_name,
    payload.counterpartyName,
    payload.recipientName,
    payload.senderName,
    payload.originatorName,
    (payload.source as Record<string, unknown> | undefined)?.sender_name,
    (payload.source as Record<string, unknown> | undefined)?.originator_name,
  ]
  for (const value of candidates) {
    const text = typeof value === "string" ? value.trim() : ""
    if (text) return text
  }
  return undefined
}

function mapRowToBusinessTransaction(row: Record<string, unknown>): TransactionWithSource {
  const payload = row.payload as Record<string, unknown> | null | undefined
  const meta = row.metadata as Record<string, unknown> | null | undefined
  const provider = String(row.provider ?? "noah").toLowerCase()
  const dirRaw = String(row.direction ?? "").toLowerCase()
  const direction = dirRaw === "in" ? "credit" : "debit"
  const st = String(row.status ?? "").toLowerCase()
  const status =
    st === "settled" ? "completed"
    : st === "pending" || st === "processing" ? st
    : st === "failed" || st === "cancelled" ? "failed"
    : st === "unknown" ? "pending"
    : (st as "completed" | "pending" | "processing" | "failed")

  const description = toProductTransactionLabel({
    provider,
    direction: dirRaw === "in" ? "in" : "out",
    metadata: meta,
  })

  const created =
    row.occurred_at != null ? String(row.occurred_at) : row.created_at != null ? String(row.created_at) : new Date().toISOString()

  const currencyCode = String(row.currency ?? "USD")
  const providerTxId = row.provider_transaction_id != null ? String(row.provider_transaction_id) : undefined
  const easnerId = displayEasnerTransactionId({
    easnerTransactionId: row.easner_transaction_id != null ? String(row.easner_transaction_id) : null,
    metadata: meta,
    providerTransactionId: providerTxId,
    occurredAt: row.occurred_at != null ? String(row.occurred_at) : null,
    createdAt: row.created_at != null ? String(row.created_at) : null,
    fallbackId: row.id != null ? String(row.id) : null,
  })
  const paymentRail =
    String(
      meta?.payment_rail ??
        meta?.source_payment_rail ??
        meta?.destination_payment_rail ??
        row.chain ??
        "",
    ).trim() || undefined
  const counterpartyName = deriveCounterpartyName({ metadata: meta, payload })
  return {
    id: easnerId,
    type: "book" as const,
    amount: typeof row.amount === "number" ? row.amount : Number(row.amount) || 0,
    displayCurrency: currencyCode,
    description,
    date: created,
    status,
    direction,
    source: "account" as const,
    reference: easnerId,
    transferId: providerTxId,
    baseCurrency: row.base_currency != null ? String(row.base_currency) : undefined,
    baseAmount: typeof row.base_amount === "number" ? row.base_amount : Number(row.base_amount) || undefined,
    collectionChannel:
      meta?.collection_channel != null ? String(meta.collection_channel) : undefined,
    autopayoutConfigId:
      meta?.autopayout_config_id != null ? String(meta.autopayout_config_id) : undefined,
    paymentRail,
    counterpartyName,
    txHash: row.tx_hash != null ? String(row.tx_hash) : undefined,
    walletAddress: row.wallet_address != null ? String(row.wallet_address) : undefined,
    counterpartyAddress:
      row.counterparty_address != null ? String(row.counterparty_address) : undefined,
    asset: row.asset != null ? String(row.asset) : undefined,
    chain: row.chain != null ? String(row.chain) : undefined,
    settledAt: row.settled_at != null ? String(row.settled_at) : undefined,
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
  const created =
    row.occurred_at != null ? String(row.occurred_at) : row.created_at != null ? String(row.created_at) : new Date().toISOString()
  const providerTxId = row.provider_transaction_id != null ? String(row.provider_transaction_id) : ""
  const meta = row.metadata as Record<string, unknown> | null | undefined
  const easnerId = displayEasnerTransactionId({
    easnerTransactionId: row.easner_transaction_id != null ? String(row.easner_transaction_id) : null,
    metadata: meta,
    providerTransactionId: providerTxId,
    occurredAt: row.occurred_at != null ? String(row.occurred_at) : null,
    createdAt: row.created_at != null ? String(row.created_at) : null,
    fallbackId: row.id != null ? String(row.id) : null,
  })
  const ledgerId = row.id != null ? String(row.id) : ""
  const idForUi = easnerId || providerTxId || ledgerId
  const amount = typeof row.amount === "number" ? row.amount : Number(row.amount) || 0
  const currency = String(row.currency ?? "USD")
  const name = toProductTransactionLabel({
    provider: String(row.provider ?? "noah"),
    direction: dirRaw === "in" ? "in" : "out",
    metadata: (row.metadata as Record<string, unknown> | null | undefined) ?? null,
  })
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

  if (scope === "business") {
    const transactions = (rows ?? []).map((r) => mapRowToBusinessTransaction(r as Record<string, unknown>))
    return NextResponse.json({ transactions })
  }

  const transactions = (rows ?? []).map((r) => mapRowToMobileTransaction(r as Record<string, unknown>))
  return NextResponse.json({ transactions })
}

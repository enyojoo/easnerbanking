import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { mapNoahTransactionToMobileDetail } from "@/lib/noah/map-transactions"
import { resolveLedgerListScope } from "@/lib/transactions-ledger-scope"
import {
  displayEasnerTransactionId,
  looksLikeUuidParam,
  normalizeEasnerTransactionIdForLookup,
} from "@/lib/easner-transaction-id"
import { mapRowToBusinessTransaction } from "@/lib/transactions/map-row-to-business"
import {
  deriveEasnerInboundRemitterDisplayName,
  toEasnerTransactionPrimaryLabel,
  toEasnerTransactionProductCategory,
} from "@easner/shared"

const LEDGER_SELECT =
  "id, easner_transaction_id, provider, provider_transaction_id, status, amount, currency, direction, metadata, payload, created_at, updated_at, occurred_at, settled_at, tx_hash, wallet_address, counterparty_address, asset, chain, base_currency, base_amount"

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
  const providerTxId = row.provider_transaction_id != null ? String(row.provider_transaction_id) : ""
  const meta = row.metadata as Record<string, unknown> | null | undefined
  const easnerId = displayEasnerTransactionId({
    easnerTransactionId: row.easner_transaction_id != null ? String(row.easner_transaction_id) : null,
    metadata: meta,
    providerTransactionId: providerTxId,
    fallbackId: row.id != null ? String(row.id) : null,
  })
  const dirRaw = String(row.direction ?? "").toLowerCase()
  const st = String(row.status ?? "").toLowerCase()
  const provider = String(row.provider ?? "noah").toLowerCase()
  const created =
    row.occurred_at != null ? String(row.occurred_at) : row.created_at != null ? String(row.created_at) : new Date().toISOString()
  const isEasetagP2p = String(meta?.source ?? "").toLowerCase() === "easetag_p2p"
  const sourceType =
    isEasetagP2p
      ? "easetag_p2p"
      : provider === "turnkey"
        ? "liquidation_address"
        : String(meta?.source_type ?? meta?.collection_channel ?? "virtual_account")
  const sourcePaymentRail =
    isEasetagP2p
      ? "easetag"
      : String(meta?.payment_rail ?? meta?.source_payment_rail ?? row.chain ?? "ach").toLowerCase()
  const destinationPaymentRail =
    isEasetagP2p
      ? "easetag"
      : String(meta?.destination_payment_rail ?? (dirRaw === "in" ? "bank" : provider === "turnkey" ? "crypto" : "bank")).toLowerCase()
  const recipientName =
    String(meta?.counterparty_name ?? (meta?.recipient_name as string | undefined) ?? "").trim() || undefined
  const reference =
    String(meta?.reference ?? meta?.narration ?? providerTxId ?? "").trim() || undefined
  const payload = row.payload as Record<string, unknown> | null | undefined
  const transaction_product = toEasnerTransactionProductCategory({
    provider: String(row.provider ?? "noah"),
    direction: dirRaw === "in" ? "in" : "out",
    metadata: meta ?? null,
    payload,
  })
  const sender_display_name =
    dirRaw === "in" && transaction_product === "Bank Deposit"
      ? deriveEasnerInboundRemitterDisplayName({ metadata: meta, payload }) || undefined
      : undefined
  return {
    ...base,
    transaction_product,
    sender_display_name,
    noah_transaction_id: easnerId || undefined,
    final_amount: base.amount,
    updated_at: row.updated_at != null ? String(row.updated_at) : created,
    completed_at: row.settled_at != null ? String(row.settled_at) : st === "settled" ? created : undefined,
    tx_hash: row.tx_hash != null ? String(row.tx_hash) : undefined,
    base_amount: typeof row.base_amount === "number" ? row.base_amount : Number(row.base_amount) || undefined,
    base_currency: row.base_currency != null ? String(row.base_currency) : undefined,
    source_type: sourceType,
    source_payment_rail: sourcePaymentRail,
    destination_payment_rail: destinationPaymentRail,
    recipient_name: recipientName,
    reference,
    metadata: {
      ...(meta || {}),
      tx_hash: row.tx_hash ?? null,
      wallet_address: row.wallet_address ?? null,
      counterparty_address: row.counterparty_address ?? null,
      asset: row.asset ?? null,
      chain: row.chain ?? null,
    },
  }
}

type Props = { params: Promise<{ transactionId: string }> }

export async function GET(request: Request, routeCtx: Props) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = user.id

  const { transactionId: rawId } = await routeCtx.params
  const transactionIdRaw = rawId?.trim()
  if (!transactionIdRaw) {
    return NextResponse.json({ error: "Missing transaction id" }, { status: 400 })
  }

  /** Accept `/transactions/etid55613389` (URL) and `ETID55613389` (display); DB stores uppercase ETID + 8 digits. */
  const normalizedEtid = normalizeEasnerTransactionIdForLookup(transactionIdRaw)
  const transactionId = normalizedEtid ?? transactionIdRaw

  const scopeRes = await resolveLedgerListScope(request, userId)
  if (!scopeRes.ok) return scopeRes.response
  const { scope, businessId } = scopeRes

  const admin = createSupabaseAdmin()

  function fetchOne(filter: { column: string; value: string }) {
    let q = admin
      .from("transactions")
      .select(LEDGER_SELECT)
      .eq(filter.column, filter.value)
    if (scope === "business") {
      q = q.eq("business_id", businessId as string)
    } else {
      q = q.eq("user_id", userId).is("business_id", null)
    }
    return q.maybeSingle()
  }

  let { data: row, error } = await fetchOne({ column: "provider_transaction_id", value: transactionId })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (!row) {
    ;({ data: row, error } = await fetchOne({ column: "easner_transaction_id", value: transactionId }))
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
  }
  if (!row) {
    let q = admin.from("transactions").select(LEDGER_SELECT).contains("metadata", {
      easner_transaction_id: transactionId,
    })
    if (scope === "business") {
      q = q.eq("business_id", businessId as string)
    } else {
      q = q.eq("user_id", userId).is("business_id", null)
    }
    ;({ data: row, error } = await q.maybeSingle())
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
  }
  if (!row && looksLikeUuidParam(transactionId)) {
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

  if (scope === "business") {
    const businessTransaction = mapRowToBusinessTransaction(rec)
    return NextResponse.json({ transaction, businessTransaction })
  }

  return NextResponse.json({ transaction })
}

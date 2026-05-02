import type { TransactionWithSource } from "@/lib/transactions"
import { displayEasnerTransactionId } from "@/lib/easner-transaction-id"
import { toEasnerTransactionPrimaryLabel } from "@easner/shared"

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

/** Maps a Supabase `transactions` ledger row to dashboard / dialog `TransactionWithSource`. */
export function mapRowToBusinessTransaction(row: Record<string, unknown>): TransactionWithSource {
  const payload = row.payload as Record<string, unknown> | null | undefined
  const meta = row.metadata as Record<string, unknown> | null | undefined
  const provider = String(row.provider ?? "noah").toLowerCase()
  const dirRaw = String(row.direction ?? "").toLowerCase()
  const direction = dirRaw === "in" ? "credit" : "debit"
  const st = String(row.status ?? "").toLowerCase()
  const status =
    st === "settled"
      ? "completed"
      : st === "pending" || st === "processing"
        ? st
        : st === "failed" || st === "cancelled"
          ? "failed"
          : st === "unknown"
            ? "pending"
            : (st as "completed" | "pending" | "processing" | "failed")

  const description = toEasnerTransactionPrimaryLabel({
    provider,
    direction: dirRaw === "in" ? "in" : "out",
    metadata: meta,
    payload,
  })

  const created =
    row.occurred_at != null
      ? String(row.occurred_at)
      : row.created_at != null
        ? String(row.created_at)
        : new Date().toISOString()

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
  const counterpartyNameRaw = deriveCounterpartyName({ metadata: meta, payload })
  const counterpartyName =
    counterpartyNameRaw && counterpartyNameRaw !== description ? counterpartyNameRaw : undefined

  const hasStablecoinSignals =
    paymentRail != null ||
    row.chain != null ||
    row.asset != null ||
    row.tx_hash != null ||
    row.wallet_address != null
  const type = hasStablecoinSignals ? ("stablecoin" as const) : ("book" as const)
  return {
    id: easnerId,
    type,
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

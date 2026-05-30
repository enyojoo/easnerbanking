import type { TransactionWithSource } from "@/lib/transactions"
import { displayEasnerTransactionId } from "@/lib/easner-transaction-id"
import {
  deriveBankDepositInboundDisplayLabel,
  formatDisplayPersonName,
  formatTransactionDetailHeroTitle,
  isBankOnrampDepositFlow,
  isVerificationDepositMetadata,
  toEasnerTransactionPrimaryLabel,
} from "@easner/shared"
import { isNoahBankOnrampFiatPayIn } from "@/lib/noah/bank-onramp-tx"
import { resolveGlobalPayoutOffRampDetail } from "@/lib/transactions/resolve-global-payout-off-ramp"

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
    if (text) {
      const formatted = formatDisplayPersonName(text)
      return formatted || text
    }
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

  const isVerification = isVerificationDepositMetadata(meta)
  const globalPayout = resolveGlobalPayoutOffRampDetail(row)
  const bankLabel =
    !isVerification && !globalPayout && (isBankOnrampDepositFlow(meta) || (payload && isNoahBankOnrampFiatPayIn(payload)))
      ? deriveBankDepositInboundDisplayLabel({ metadata: meta, payload: payload ?? undefined })
      : undefined
  const description =
    globalPayout?.displayDescription ??
    bankLabel ??
    toEasnerTransactionPrimaryLabel({
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

  const currencyCode = globalPayout
    ? globalPayout.displayCurrency
    : String(row.currency ?? "USD")
  const listAmount = globalPayout ? globalPayout.displayAmount : typeof row.amount === "number" ? row.amount : Number(row.amount) || 0
  const listBaseAmount = globalPayout ? globalPayout.ledgerAmount : typeof row.base_amount === "number" ? row.base_amount : Number(row.base_amount) || undefined
  const listBaseCurrency = globalPayout
    ? globalPayout.ledgerCurrency
    : row.base_currency != null
      ? String(row.base_currency)
      : undefined
  const providerTxId = row.provider_transaction_id != null ? String(row.provider_transaction_id) : undefined
  const easnerId = displayEasnerTransactionId({
    easnerTransactionId: row.easner_transaction_id != null ? String(row.easner_transaction_id) : null,
    metadata: meta,
    providerTransactionId: providerTxId,
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

  const isEasetagP2p = String(meta?.source ?? "").toLowerCase() === "easetag_p2p"
  const displayHeroTitle =
    globalPayout?.displayHeroTitle ??
    (bankLabel && dirRaw === "in"
      ? formatTransactionDetailHeroTitle({
          direction: "in",
          counterpartyName: bankLabel,
          productFallback: "Bank Deposit",
        })
      : undefined)
  const sendNote =
    typeof meta?.send_note === "string"
      ? meta.send_note.trim()
      : typeof meta?.note === "string"
        ? meta.note.trim()
        : ""

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
    amount: listAmount,
    displayCurrency: currencyCode,
    description,
    date: created,
    status,
    direction,
    source: "account" as const,
    reference: easnerId,
    paymentScheme: isEasetagP2p ? "Easetag" : undefined,
    transferId: providerTxId,
    baseCurrency: listBaseCurrency,
    baseAmount: listBaseAmount,
    ...(globalPayout
      ? {
          displayHeroTitle: globalPayout.displayHeroTitle,
          ledgerAmount: globalPayout.ledgerAmount,
          ledgerCurrency: globalPayout.ledgerCurrency,
          payoutReview: globalPayout.payoutReview ?? undefined,
          recipientSnapshot: globalPayout.recipientSnapshot ?? undefined,
          lifecycle: globalPayout.lifecycle,
        }
      : displayHeroTitle
        ? { displayHeroTitle }
        : {}),
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
    ...(sendNote ? { sendNote } : {}),
  }
}

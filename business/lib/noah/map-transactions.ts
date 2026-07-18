/** Map Noah `Transaction` objects (see https://docs.noah.com/) to the mobile transaction list/detail shape. */

import {
  deriveEasnerInboundRemitterDisplayName,
  toEasnerTransactionPrimaryLabel,
  toEasnerTransactionProductCategory,
} from "@easner/shared"

export {
  isNoahGlobalPayoutSellTx,
  pickNoahGlobalPayoutLedgerFields,
  pickNoahCryptoDebitAmount,
  settlementWalletCurrencyForNoahCrypto,
  type NoahGlobalPayoutLedgerFields,
} from "./global-payout-ledger"

function mapNoahTxStatus(s: string): string {
  const lower = s.toLowerCase()
  if (lower === "settled") return "completed"
  if (lower === "pending") return "pending"
  if (lower === "failed") return "failed"
  return lower || "unknown"
}

function inferSourceType(tx: Record<string, unknown>): string | undefined {
  const direction = String(tx.Direction ?? "")
  if (direction !== "In") return undefined
  const net = String(tx.Network ?? "")
  const crypto = String(tx.CryptoCurrency ?? "").toUpperCase()
  if (net && net !== "OffNetwork" && (crypto.includes("USDC") || crypto.includes("EURC") || crypto.includes("BTC") || crypto.includes("ETH"))) {
    return "liquidation_address"
  }
  return "virtual_account"
}

export function pickTxAmountAndCurrency(tx: Record<string, unknown>): { amount: number; currency: string } {
  const fp = tx.FiatPayment as Record<string, unknown> | undefined
  if (fp && fp.Amount != null) {
    return {
      amount: Math.abs(parseFloat(String(fp.Amount)) || 0),
      currency: String(fp.FiatCurrency || "USD"),
    }
  }
  return {
    amount: Math.abs(parseFloat(String(tx.Amount ?? "0")) || 0),
    currency: String(tx.CryptoCurrency || "USD"),
  }
}

/** True when `payload` is a Noah REST Transaction — not a YC webhook or other provider blob. */
export function isNoahLedgerTransactionPayload(
  payload: Record<string, unknown> | null | undefined,
  row?: Record<string, unknown>,
): boolean {
  if (!payload || typeof payload !== "object") return false
  if (String(row?.provider ?? "").toLowerCase() === "yellowcard") return false
  if (payload.event != null || payload.sequenceId != null || payload.sequence_id != null) {
    return false
  }
  if (payload.settlementInfo != null || payload.settlement_info != null) return false
  if (payload.ID != null) return true
  if (payload.Direction != null || payload.Status != null || payload.Created != null) return true
  return false
}

export function mapNoahTransactionToMobileItem(tx: Record<string, unknown>): Record<string, unknown> {
  const id = String(tx.ID ?? "")
  const direction = String(tx.Direction ?? "")
  const transaction_type = direction === "In" ? "receive" : "send"
  const { amount, currency } = pickTxAmountAndCurrency(tx)
  const status = mapNoahTxStatus(String(tx.Status ?? ""))
  const created = String(tx.Created ?? new Date().toISOString())
  const source_type = inferSourceType(tx)
  const name =
    direction === "In"
      ? toEasnerTransactionPrimaryLabel({
          provider: "noah",
          direction: "in",
          metadata: { noah: tx },
          payload: tx,
        })
      : "Sent"

  return {
    id,
    transaction_id: id,
    type: transaction_type,
    transaction_type,
    amount,
    currency,
    status,
    created_at: created,
    noah_created_at: created,
    name,
    direction: direction === "In" ? "credit" : "debit",
    source_type,
    metadata: { noah: tx },
  }
}

/** Merge ledger metadata enrichment for bank onramp pay-ins into mobile detail shape. */
export function enrichMobileDetailFromLedgerMetadata(
  detail: Record<string, unknown>,
  meta: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!meta || typeof meta !== "object") return detail
  const fee = meta.fee_amount
  const settled = meta.settled_amount
  const sourceType = meta.source_type
  const reference = meta.reference
  const sender =
    typeof meta.sender_name === "string"
      ? meta.sender_name
      : typeof meta.remitter_name === "string"
        ? meta.remitter_name
        : undefined
  return {
    ...detail,
    ...(sourceType != null ? { source_type: String(sourceType) } : {}),
    ...(sender ? { sender_display_name: sender } : {}),
    ...(reference != null && String(reference).trim() ? { reference: String(reference).trim() } : {}),
    ...(typeof fee === "number" && Number.isFinite(fee) ? { fee_amount: fee } : {}),
    ...(typeof settled === "number" && Number.isFinite(settled)
      ? {
          final_amount: settled,
          receipt_final_amount: settled,
          settled_amount: settled,
          posted_amount: settled,
          settled_currency:
            meta.settled_currency != null
              ? String(meta.settled_currency)
              : meta.fiat_deposit_currency != null
                ? String(meta.fiat_deposit_currency)
                : detail.currency,
          posted_currency:
            meta.settled_currency != null
              ? String(meta.settled_currency)
              : meta.fiat_deposit_currency != null
                ? String(meta.fiat_deposit_currency)
                : detail.currency,
        }
      : {}),
    ...(typeof meta.fiat_deposit_amount === "number"
      ? { deposit_amount: meta.fiat_deposit_amount }
      : typeof meta.deposit_amount === "number"
        ? { deposit_amount: meta.deposit_amount }
        : {}),
  }
}

export function mapNoahTransactionToMobileDetail(tx: Record<string, unknown>): Record<string, unknown> {
  const base = mapNoahTransactionToMobileItem(tx)
  const id = String(tx.ID ?? "")
  const direction = String(tx.Direction ?? "")
  const st = String(tx.Status ?? "")
  const created = String(tx.Created ?? new Date().toISOString())
  const transaction_product = toEasnerTransactionProductCategory({
    provider: "noah",
    direction: direction === "In" ? "in" : "out",
    metadata: { noah: tx },
    payload: tx,
  })
  const sender_display_name =
    direction === "In" && transaction_product === "Bank Deposit"
      ? deriveEasnerInboundRemitterDisplayName({ metadata: { noah: tx }, payload: tx }) || undefined
      : undefined
  return {
    ...base,
    transaction_product,
    sender_display_name,
    id,
    transaction_id: id,
    noah_transaction_id: id,
    final_amount: base.amount,
    updated_at: created,
    completed_at: st === "Settled" ? created : undefined,
    source_payment_rail: "ach",
    destination_payment_rail: direction === "In" ? "bank" : "crypto",
  }
}

import { formatTransactionDetailHeroTitle } from "@easner/shared"
import type { GlobalPayoutRecipientSnapshot } from "@easner/shared/transactions/global-payout-types"
import {
  isWalletSendOutRow,
  resolveWalletSendPayoutReview,
} from "@/lib/wallet-send/build-wallet-send-payout-review"

export function attachWalletSendDetailFields(
  row: Record<string, unknown>,
  transaction: Record<string, unknown>,
): Record<string, unknown> {
  if (!isWalletSendOutRow(row)) return transaction

  const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
  const ledgerAmount =
    typeof row.amount === "number" ? row.amount : Number(row.amount) || 0
  const ledgerCurrency = String(row.currency ?? row.base_currency ?? "USD").toUpperCase()

  const payoutReview = resolveWalletSendPayoutReview(meta, ledgerAmount, ledgerCurrency)
  if (!payoutReview) return transaction

  const counterpartyAddress =
    row.counterparty_address != null ? String(row.counterparty_address) : undefined
  const recipientSnapshot =
    meta.recipient_snapshot && typeof meta.recipient_snapshot === "object"
      ? (meta.recipient_snapshot as GlobalPayoutRecipientSnapshot)
      : undefined
  const recipientName =
    String(
      meta.counterparty_name ??
        meta.recipient_name ??
        recipientSnapshot?.full_name ??
        counterpartyAddress ??
        "",
    ).trim() || "Wallet transfer"
  const sendNote =
    typeof meta.send_note === "string"
      ? meta.send_note.trim()
      : typeof meta.note === "string"
        ? meta.note.trim()
        : ""
  const transactionTiming = payoutReview.processing_time
    ? [{ label: "Processing time", value: payoutReview.processing_time }]
    : undefined

  return {
    ...transaction,
    amount: payoutReview.receive_amount,
    currency: payoutReview.receive_currency,
    display_amount: payoutReview.receive_amount,
    display_currency: payoutReview.receive_currency,
    display_description: recipientName,
    display_hero_title: formatTransactionDetailHeroTitle({
      direction: "out",
      counterpartyName: recipientName,
      productFallback: "Transfer",
    }),
    ledger_amount: payoutReview.total_debited,
    ledger_currency: payoutReview.send_currency,
    payout_review: payoutReview,
    ...(recipientSnapshot ? { recipient_snapshot: recipientSnapshot } : {}),
    ...(sendNote ? { send_note: sendNote } : {}),
    ...(transactionTiming ? { transaction_timing: transactionTiming } : {}),
    description: recipientName,
    name: recipientName,
    metadata: {
      ...((transaction.metadata as Record<string, unknown> | undefined) ?? {}),
      ...meta,
      counterparty_address: counterpartyAddress ?? meta.counterparty_address ?? null,
      receive_network:
        meta.receive_network ?? meta.chain ?? row.chain ?? null,
    },
  }
}

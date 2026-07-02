import {
  buildGlobalPayoutLifecycle,
  buildTransactionTimingRows,
  formatTransactionDetailHeroTitle,
  resolveTransactionTimingAnchors,
  walletSendListProductLabel,
  walletSendUserFacingDisplayCurrency,
} from "@easner/shared"
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
  const ledgerStatus = String(row.status ?? "").trim().toLowerCase()
  const ledgerCreatedAt = row.created_at != null ? String(row.created_at) : null
  const timingAnchors = resolveTransactionTimingAnchors({
    createdAt: ledgerCreatedAt,
    metadata: meta,
    webhookCompletedAt: row.settled_at != null ? String(row.settled_at) : null,
    webhookFailedAt:
      meta.failed_at != null ? String(meta.failed_at).trim() || null : null,
  })
  const transactionTiming = buildTransactionTimingRows({
    status: ledgerStatus,
    startedAt: timingAnchors.startedAt,
    completedAt: timingAnchors.completedAt,
    failedAt: timingAnchors.failedAt,
    showExpectedWhileInFlight: false,
    showStartedWhileInFlight: false,
    showTerminalDuration: false,
  })

  const displayCurrency = walletSendUserFacingDisplayCurrency({
    receiveCurrency: payoutReview.receive_currency,
    sendCurrency: payoutReview.send_currency,
    executionModel: payoutReview.execution_model,
  })
  // Direct Turnkey (and Easetag-style instant sends) settle during execute — no transfer tracker.
  // LI.FI bridge may return pending; show Processing → Complete only while still in flight.
  const lifecycle =
    payoutReview.execution_model === "lifi_bridge" &&
    (ledgerStatus === "pending" || ledgerStatus === "processing")
      ? buildGlobalPayoutLifecycle({
          status: ledgerStatus,
          metadata: meta,
          occurredAt: row.occurred_at != null ? String(row.occurred_at) : null,
          settledAt: row.settled_at != null ? String(row.settled_at) : null,
          createdAt: row.created_at != null ? String(row.created_at) : null,
          payoutReview,
          recipientName,
        })
      : undefined

  return {
    ...transaction,
    amount: payoutReview.receive_amount,
    currency: displayCurrency,
    display_amount: payoutReview.receive_amount,
    display_currency: displayCurrency,
    display_description: recipientName,
    display_hero_title: formatTransactionDetailHeroTitle({
      direction: "out",
      counterpartyName: recipientName,
      productFallback: "Transfer",
    }),
    transaction_product: walletSendListProductLabel(),
    ledger_amount: payoutReview.total_debited,
    ledger_currency: payoutReview.send_currency,
    payout_review: payoutReview,
    ...(lifecycle ? { lifecycle } : {}),
    ...(recipientSnapshot ? { recipient_snapshot: recipientSnapshot } : {}),
    ...(sendNote ? { send_note: sendNote } : {}),
    ...(ledgerCreatedAt ? { ledger_created_at: ledgerCreatedAt } : {}),
    ...(transactionTiming.length ? { transaction_timing: transactionTiming } : {}),
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

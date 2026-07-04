import type { TransactionWithSource } from "@/lib/transactions"
import {
  deriveBankDepositInboundDisplayLabel,
  displayEasnerTransactionIdForList,
  formatDisplayPersonName,
  formatTransactionDetailHeroTitle,
  buildTransactionTimingRows,
  resolveTransactionTimingAnchors,
  isBankOnrampDepositFlow,
  isVerificationDepositMetadata,
  mapLedgerStatusForUserFeed,
  resolveGlobalPayoutListDisplay,
  resolveWalletSendListDisplay,
  toEasnerTransactionPrimaryLabel,
} from "@easner/shared"
import { isNoahBankOnrampFiatPayIn } from "@/lib/noah/bank-onramp-tx"
import { resolveBankDepositPayInDetail } from "@/lib/transactions/resolve-bank-deposit-pay-in"
import { resolveStablecoinDepositPayInDetail } from "@/lib/transactions/resolve-stablecoin-deposit-pay-in"
import { resolveGlobalPayoutOffRampDetail } from "@/lib/transactions/resolve-global-payout-off-ramp"
import {
  isWalletSendOutRow,
  resolveWalletSendPayoutReview,
} from "@/lib/wallet-send/build-wallet-send-payout-review"

function resolveWalletSendTransactionTiming(row: Record<string, unknown>) {
  const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
  const timingAnchors = resolveTransactionTimingAnchors({
    createdAt: row.created_at != null ? String(row.created_at) : null,
    metadata: meta,
    webhookCompletedAt: row.settled_at != null ? String(row.settled_at) : readMetaIso(meta, "completed_at"),
    webhookFailedAt: readMetaIso(meta, "failed_at"),
  })
  return buildTransactionTimingRows({
    status: String(row.status ?? ""),
    startedAt: timingAnchors.startedAt,
    completedAt: timingAnchors.completedAt,
    failedAt: timingAnchors.failedAt,
    showExpectedWhileInFlight: false,
    showStartedWhileInFlight: false,
    showTerminalDuration: false,
  })
}

function readMetaIso(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key]
  if (v == null) return null
  const s = String(v).trim()
  return s || null
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
  const status = mapLedgerStatusForUserFeed(String(row.status ?? "")) as TransactionWithSource["status"]

  const isVerification = isVerificationDepositMetadata(meta)
  const globalPayoutDetail = resolveGlobalPayoutOffRampDetail(row)
  const ledgerAmountForReview =
    typeof row.amount === "number" ? row.amount : Number(row.amount) || 0
  const ledgerCurrencyForReview = String(row.currency ?? "USD").toUpperCase()
  const walletSendPayoutReview =
    !globalPayoutDetail && meta && isWalletSendOutRow(row)
      ? resolveWalletSendPayoutReview(meta, ledgerAmountForReview, ledgerCurrencyForReview)
      : null
  const bankDepositDetail =
    !globalPayoutDetail &&
    !isVerification &&
    (isBankOnrampDepositFlow(meta) || (payload && isNoahBankOnrampFiatPayIn(payload)))
      ? resolveBankDepositPayInDetail(row)
      : null
  const stablecoinDepositDetail =
    !globalPayoutDetail && !walletSendPayoutReview && !bankDepositDetail && !isVerification
      ? resolveStablecoinDepositPayInDetail(row)
      : null
  const globalPayoutList = globalPayoutDetail ? null : resolveGlobalPayoutListDisplay(row)
  const walletSendList =
    globalPayoutDetail || walletSendPayoutReview ? null : resolveWalletSendListDisplay(row)
  const globalPayout = globalPayoutDetail ?? globalPayoutList
  const bankLabel =
    !isVerification && !globalPayout && (isBankOnrampDepositFlow(meta) || (payload && isNoahBankOnrampFiatPayIn(payload)))
      ? deriveBankDepositInboundDisplayLabel({ metadata: meta, payload: payload ?? undefined })
      : undefined
  const counterpartyNameRaw = deriveCounterpartyName({ metadata: meta, payload })
  const walletSendDisplay = walletSendPayoutReview
    ? {
        displayAmount: walletSendPayoutReview.receive_amount,
        displayCurrency: walletSendPayoutReview.receive_currency,
        ledgerAmount: walletSendPayoutReview.total_debited,
        ledgerCurrency: walletSendPayoutReview.send_currency,
        displayDescription:
          counterpartyNameRaw ||
          toEasnerTransactionPrimaryLabel({
            provider,
            direction: dirRaw === "in" ? "in" : "out",
            metadata: meta,
            payload,
          }),
        displayHeroTitle: formatTransactionDetailHeroTitle({
          direction: "out",
          counterpartyName: counterpartyNameRaw || "Wallet transfer",
          productFallback: "Transfer",
        }),
      }
    : null
  const walletSendListDisplay = walletSendList
    ? {
        displayAmount: walletSendList.displayAmount,
        displayCurrency: walletSendList.displayCurrency,
        ledgerAmount: walletSendList.ledgerAmount,
        ledgerCurrency: walletSendList.ledgerCurrency,
        displayDescription: walletSendList.displayDescription,
        displayHeroTitle: walletSendList.displayHeroTitle,
      }
    : null
  const displaySource = globalPayout ?? walletSendDisplay ?? walletSendListDisplay
  const description =
    displaySource?.displayDescription ??
    bankLabel ??
    toEasnerTransactionPrimaryLabel({
      provider,
      direction: dirRaw === "in" ? "in" : "out",
      metadata: meta,
      payload,
    })

  const ledgerCreatedAt =
    row.created_at != null ? String(row.created_at) : undefined

  const created =
    row.occurred_at != null
      ? String(row.occurred_at)
      : row.created_at != null
        ? String(row.created_at)
        : new Date().toISOString()

  const currencyCode = displaySource
    ? displaySource.displayCurrency
    : String(row.currency ?? "USD")
  const listAmount = displaySource
    ? displaySource.displayAmount
    : typeof row.amount === "number"
      ? row.amount
      : Number(row.amount) || 0
  const listBaseAmount = displaySource
    ? displaySource.ledgerAmount
    : typeof row.base_amount === "number"
      ? row.base_amount
      : Number(row.base_amount) || undefined
  const listBaseCurrency = displaySource
    ? displaySource.ledgerCurrency
    : row.base_currency != null
      ? String(row.base_currency)
      : undefined
  const providerTxId = row.provider_transaction_id != null ? String(row.provider_transaction_id) : undefined
  const easnerId = displayEasnerTransactionIdForList({
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
  const counterpartyName = stablecoinDepositDetail?.senderDisplay
    ? stablecoinDepositDetail.senderDisplay
    : counterpartyNameRaw && counterpartyNameRaw !== description
      ? counterpartyNameRaw
      : undefined

  const isEasetagP2p = String(meta?.source ?? "").toLowerCase() === "easetag_p2p"
  const displayHeroTitle =
    displaySource?.displayHeroTitle ??
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
    paymentScheme: isEasetagP2p
      ? "Easetag"
      : stablecoinDepositDetail?.schemeLabel ?? undefined,
    transferId: providerTxId,
    baseCurrency: listBaseCurrency,
    baseAmount: listBaseAmount,
    ...(globalPayoutDetail
      ? {
          displayHeroTitle: globalPayoutDetail.displayHeroTitle,
          ledgerAmount: globalPayoutDetail.ledgerAmount,
          ledgerCurrency: globalPayoutDetail.ledgerCurrency,
          payoutReview: globalPayoutDetail.payoutReview ?? undefined,
          recipientSnapshot: globalPayoutDetail.recipientSnapshot ?? undefined,
          lifecycle: globalPayoutDetail.lifecycle,
          transactionTiming: globalPayoutDetail.transactionTiming,
          ledgerCreatedAt: globalPayoutDetail.ledgerCreatedAt ?? ledgerCreatedAt,
        }
      : walletSendPayoutReview
        ? {
            displayHeroTitle: walletSendDisplay?.displayHeroTitle,
            ledgerAmount: walletSendPayoutReview.total_debited,
            ledgerCurrency: walletSendPayoutReview.send_currency,
            payoutReview: walletSendPayoutReview,
            recipientSnapshot:
              meta?.recipient_snapshot && typeof meta.recipient_snapshot === "object"
                ? (meta.recipient_snapshot as TransactionWithSource["recipientSnapshot"])
                : undefined,
            transactionTiming: resolveWalletSendTransactionTiming(row),
            ledgerCreatedAt,
          }
      : walletSendList
        ? {
            displayHeroTitle: walletSendList.displayHeroTitle,
            ledgerAmount: walletSendList.ledgerAmount,
            ledgerCurrency: walletSendList.ledgerCurrency,
            ledgerCreatedAt,
          }
      : bankDepositDetail
        ? {
            lifecycle: bankDepositDetail.lifecycle,
            transactionTiming: bankDepositDetail.transactionTiming,
            depositAmount: bankDepositDetail.depositAmount,
            postedAmount: bankDepositDetail.postedAmount ?? undefined,
            postedCurrency: bankDepositDetail.postedCurrency,
            paymentScheme: bankDepositDetail.depositSchemeLabel,
            narration: bankDepositDetail.narration ?? undefined,
            fee: bankDepositDetail.feeAmount || undefined,
            ledgerCreatedAt: bankDepositDetail.ledgerCreatedAt ?? ledgerCreatedAt,
          }
        : stablecoinDepositDetail
        ? {
            lifecycle: stablecoinDepositDetail.lifecycle,
            transactionTiming: stablecoinDepositDetail.transactionTiming,
            postedAmount: stablecoinDepositDetail.postedAmount || undefined,
            postedCurrency: stablecoinDepositDetail.postedCurrency,
            paymentScheme: stablecoinDepositDetail.schemeLabel,
            // Parity with mobile: surface the deposit fee so the "Processing fee" row
            // renders in-app and on the receipt (hidden automatically when 0).
            fee: stablecoinDepositDetail.feeAmount || undefined,
            ledgerCreatedAt: stablecoinDepositDetail.ledgerCreatedAt ?? ledgerCreatedAt,
          }
        : globalPayoutList
        ? {
            displayHeroTitle: globalPayoutList.displayHeroTitle,
            ledgerAmount: globalPayoutList.ledgerAmount,
            ledgerCurrency: globalPayoutList.ledgerCurrency,
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
    ledgerCreatedAt,
    ...(sendNote ? { sendNote } : {}),
  }
}

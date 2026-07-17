/**
 * Shared, metadata-only mapper for ledger list rows.
 *
 * This module intentionally has zero dependency on business-app imports
 * (`@/lib/*`, `resolveGlobalPayoutOffRampDetail`, `generateTransactionId`,
 * etc.) so it can be consumed by:
 *   - `packages/shared` realtime bridge (mapTransactionInsert)
 *   - Mobile API calls (mobile hook)
 *   - Business `/api/transactions` route (instead of local copy)
 *
 * **No `payload`:** list reads omit the `payload` column; all display fields
 * are derived from `metadata` which is denormalized at write time.
 */

import { deriveBankDepositInboundDisplayLabel } from "./bank-deposit-inbound-label"
import { isBankOnrampDepositFlow } from "./bank-deposit-lifecycle"
import { isGlobalPayoutOffRampOutRow } from "./global-payout-flow"
import {
  isWalletSendOutRow,
  resolveWalletSendTransferMethod,
  walletSendListProductLabel,
  walletSendUserFacingDisplayCurrency,
} from "./wallet-send-flow"
import {
  isEasnerProductReceiveTitle,
  toEasnerTransactionPrimaryLabel,
} from "./product-label"
import { resolveLedgerWhenAt } from "./transaction-timing-display"
import {
  isYcFundBalanceDepositMetadata,
  resolveYcFundBalanceDepositDisplayTitle,
} from "./yc-deposit-display"
import {
  isVerificationDepositMetadata,
  VERIFICATION_DEPOSIT_LIST_LABEL,
} from "./verification-deposit"
import { resolveAccountImpactAmount } from "./account-impact-reporting"
import { formatOutboundTransferTitle } from "./transaction-detail-hero-title"

// ---------------------------------------------------------------------------
// Display id helpers (pure — no generation dependency)
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

/** Read the persisted `easner_transaction_id` out of a metadata blob. */
export function readEasnerTransactionIdFromMetadata(metadata: unknown): string | null {
  if (!isObject(metadata)) return null
  const value = metadata.easner_transaction_id
  const id = typeof value === "string" ? value.trim() : ""
  if (!id || id.toLowerCase() === "null") return null
  return id
}

/**
 * Display/reference id for a ledger list row.
 * Prefers the persisted ETID column, then metadata, then provider tx id, then DB uuid.
 * Does NOT generate synthetic ids — that remains a server-side concern.
 */
export function displayEasnerTransactionIdForList(input: {
  easnerTransactionId?: string | null
  metadata?: Record<string, unknown> | null
  providerTransactionId?: string | null
  fallbackId?: string | null
}): string {
  const fromColumn = String(input.easnerTransactionId || "").trim()
  if (fromColumn && fromColumn.toLowerCase() !== "null") return fromColumn

  const fromMeta = readEasnerTransactionIdFromMetadata(input.metadata)
  if (fromMeta) return fromMeta

  const providerTxId = String(input.providerTransactionId || "").trim()
  if (providerTxId.startsWith("ETID")) return providerTxId

  const fallback = String(input.fallbackId || "").trim()
  if (fallback) return fallback

  if (providerTxId) return providerTxId

  return ""
}

// ---------------------------------------------------------------------------
// Source-type inference (metadata-only)
// ---------------------------------------------------------------------------

/** Infer list `source_type` from denormalized metadata (no `payload` required). */
export function inferLedgerListSourceType(
  meta: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!meta) return undefined
  if (String(meta.source ?? "").toLowerCase() === "easetag_p2p") return "easetag_p2p"
  const explicit = String(meta.source_type ?? "").trim()
  if (explicit) return explicit
  if (isBankOnrampDepositFlow(meta)) return "virtual_account"
  if (meta.noah_fiat_deposit_id || meta.flow === "bank_onramp") return "virtual_account"
  const src = String(meta.source ?? "").toLowerCase()
  if (
    src === "turnkey_webhook" ||
    src === "turnkey_chain_sync" ||
    src === "turnkey_balance_webhook" ||
    src === "helius_webhook"
  ) {
    return "liquidation_address"
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Global payout list display (metadata-only, no payload)
// ---------------------------------------------------------------------------

/** Resolved display fields for a global fiat payout row on the list path. */
export type GlobalPayoutListDisplay = {
  displayAmount: number
  displayCurrency: string
  ledgerAmount: number
  ledgerCurrency: string
  displayDescription: string
  displayHeroTitle: string
  transactionProduct?: string
  transferMethod?: string
}

function resolveOutboundRecipientName(
  meta: Record<string, unknown>,
): string | undefined {
  const recipientSnapshot =
    meta.recipient_snapshot && typeof meta.recipient_snapshot === "object"
      ? (meta.recipient_snapshot as Record<string, unknown>)
      : null
  return firstTruthy([
    recipientSnapshot?.full_name,
    recipientSnapshot?.name,
    meta.beneficiary_name,
    meta.recipient_name,
    meta.counterparty_name,
  ])
}

function transferToTitle(
  meta: Record<string, unknown>,
  fallbackRecipient: string,
): string {
  return formatOutboundTransferTitle(
    resolveOutboundRecipientName(meta),
    fallbackRecipient,
  )
}

/**
 * Metadata-only global payout list display — used when `payload` is not loaded.
 * Recipient name, receive amount, and receive currency are denormalized at write time.
 */
export function resolveGlobalPayoutListDisplay(
  row: Record<string, unknown>,
): GlobalPayoutListDisplay | null {
  if (!isGlobalPayoutOffRampOutRow(row)) return null

  const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
  const ledgerAmount = typeof row.amount === "number" ? row.amount : Number(row.amount) || 0
  const ledgerCurrency = String(row.currency ?? row.base_currency ?? "USD").toUpperCase()

  const displayAmount =
    (typeof meta.receive_amount === "number"
      ? meta.receive_amount
      : meta.display_amount != null
        ? Number(meta.display_amount)
        : null) ?? ledgerAmount
  const displayCurrency = String(
    meta.receive_currency ?? meta.fiat_currency ?? meta.display_currency ?? ledgerCurrency,
  ).toUpperCase()

  const title = transferToTitle(meta, "Recipient")

  return {
    displayAmount: Number.isFinite(displayAmount) ? displayAmount : ledgerAmount,
    displayCurrency,
    ledgerAmount,
    ledgerCurrency,
    displayDescription: title,
    displayHeroTitle: title,
  }
}

/** Resolved display fields for a wallet send row on the list path. */
export function resolveWalletSendListDisplay(
  row: Record<string, unknown>,
): GlobalPayoutListDisplay | null {
  if (!isWalletSendOutRow(row)) return null

  const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
  const ledgerAmount = typeof row.amount === "number" ? row.amount : Number(row.amount) || 0
  const ledgerCurrency = String(row.currency ?? row.base_currency ?? "USD").toUpperCase()

  const payoutReview =
    meta.payout_review && typeof meta.payout_review === "object"
      ? (meta.payout_review as Record<string, unknown>)
      : null

  const displayAmount =
    (typeof payoutReview?.receive_amount === "number"
      ? payoutReview.receive_amount
      : typeof meta.receive_amount === "number"
        ? meta.receive_amount
        : meta.display_amount != null
          ? Number(meta.display_amount)
          : null) ?? ledgerAmount
  const receiveCurrency = String(
    payoutReview?.receive_currency ??
      meta.receive_asset ??
      meta.receive_currency ??
      meta.display_currency ??
      ledgerCurrency,
  ).toUpperCase()
  const sendCurrency = String(
    payoutReview?.send_currency ?? meta.send_currency ?? ledgerCurrency,
  ).toUpperCase()
  const executionModel = String(
    payoutReview?.execution_model ?? meta.execution_model ?? "",
  ).trim()
  const displayCurrency = walletSendUserFacingDisplayCurrency({
    receiveCurrency,
    sendCurrency,
    executionModel: executionModel || null,
  })

  const title = transferToTitle(meta, "External Wallet")

  return {
    displayAmount: Number.isFinite(displayAmount) ? displayAmount : ledgerAmount,
    displayCurrency,
    ledgerAmount,
    ledgerCurrency,
    displayDescription: title,
    displayHeroTitle: title,
    transactionProduct: walletSendListProductLabel(),
    transferMethod: resolveWalletSendTransferMethod(
      String(payoutReview?.transfer_method ?? meta.transfer_method ?? ""),
      receiveCurrency,
      String(meta.receive_network ?? meta.chain ?? ""),
    ),
  }
}

/** Destination-side list and hero display for YC local-to-local transfers. */
export function resolveYcCrossBorderListDisplay(
  row: Record<string, unknown>,
): GlobalPayoutListDisplay | null {
  const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
  if (
    String(row.direction ?? "").toLowerCase() !== "out" ||
    String(meta.yc_mode ?? "") !== "cross_border_send"
  ) {
    return null
  }

  const ledgerAmount =
    typeof row.amount === "number" ? row.amount : Number(row.amount) || 0
  const ledgerCurrency = String(
    row.currency ?? row.base_currency ?? "USD",
  ).toUpperCase()
  const receiveAmount = Number(meta.receive_amount)
  const receiveCurrency = String(meta.receive_currency ?? "").toUpperCase()
  const title = transferToTitle(meta, "Recipient")

  return {
    displayAmount:
      Number.isFinite(receiveAmount) && receiveAmount > 0
        ? receiveAmount
        : ledgerAmount,
    displayCurrency: receiveCurrency || ledgerCurrency,
    ledgerAmount,
    ledgerCurrency,
    displayDescription: title,
    displayHeroTitle: title,
  }
}

function firstTruthy(values: unknown[]): string | undefined {
  for (const v of values) {
    if (v != null && typeof v === "string" && v.trim()) return v.trim()
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Status normalisation
// ---------------------------------------------------------------------------

export function mapLedgerStatusForUserFeed(st: string): string {
  const lower = st.toLowerCase()
  if (lower === "settled") return "completed"
  if (lower === "pending" || lower === "processing") return lower
  if (lower === "failed" || lower === "cancelled") return "failed"
  if (lower === "unknown") return "pending"
  return lower || "unknown"
}

// ---------------------------------------------------------------------------
// Feed visibility guard
// ---------------------------------------------------------------------------

/** Returns `false` when the row should be excluded from a user-facing feed. */
export function shouldIncludeRowInUserFeed(row: Record<string, unknown>): boolean {
  return row.hidden_from_feed !== true
}

// ---------------------------------------------------------------------------
// Mobile list item mapper
// ---------------------------------------------------------------------------

/**
 * Map a Supabase `transactions` ledger row (no `payload`) to the mobile API
 * list shape.  Identical output to `business/app/api/transactions route.ts`
 * `mapLedgerRowToMobileItem`, but importable from `@easner/shared`.
 */
export function mapLedgerRowToMobileListItem(row: Record<string, unknown>): Record<string, unknown> {
  const dirRaw = String(row.direction ?? "").toLowerCase()
  const transaction_type = dirRaw === "in" ? "receive" : "send"
  const st = mapLedgerStatusForUserFeed(String(row.status ?? ""))
  const created =
    resolveLedgerWhenAt({
      occurredAt: row.occurred_at != null ? String(row.occurred_at) : null,
      createdAt: row.created_at != null ? String(row.created_at) : null,
    }) ?? new Date().toISOString()

  const providerTxId = row.provider_transaction_id != null ? String(row.provider_transaction_id) : ""
  const meta = row.metadata as Record<string, unknown> | null | undefined
  const easnerId = displayEasnerTransactionIdForList({
    easnerTransactionId: row.easner_transaction_id != null ? String(row.easner_transaction_id) : null,
    metadata: meta,
    providerTransactionId: providerTxId,
    fallbackId: row.id != null ? String(row.id) : null,
  })
  const ledgerId = row.id != null ? String(row.id) : ""
  const idForUi = easnerId || providerTxId || ledgerId
  const amount = typeof row.amount === "number" ? row.amount : Number(row.amount) || 0
  const currency = String(row.currency ?? "USD")

  const isVerification = isVerificationDepositMetadata(meta)
  const isYcFundBalance = isYcFundBalanceDepositMetadata(meta)
  const ycDepositTitle = isYcFundBalance ? resolveYcFundBalanceDepositDisplayTitle(meta ?? {}) : undefined
  const bankLabel =
    !isVerification && !isYcFundBalance && isBankOnrampDepositFlow(meta)
      ? deriveBankDepositInboundDisplayLabel({ metadata: meta })
      : undefined

  const name = isVerification
    ? VERIFICATION_DEPOSIT_LIST_LABEL
    : ycDepositTitle ??
      bankLabel ??
      toEasnerTransactionPrimaryLabel({
        provider: String(row.provider ?? "noah"),
        direction: dirRaw === "in" ? "in" : "out",
        metadata: meta ?? null,
        payload: null,
      })

  const globalPayout = resolveGlobalPayoutListDisplay(row)
  const walletSend = globalPayout ? null : resolveWalletSendListDisplay(row)
  const ycCrossBorder =
    globalPayout || walletSend ? null : resolveYcCrossBorderListDisplay(row)
  const payoutDisplay = globalPayout ?? walletSend ?? ycCrossBorder
  const displayAmount = payoutDisplay?.displayAmount ?? amount
  const displayCurrency = payoutDisplay?.displayCurrency ?? currency
  const displayName = payoutDisplay?.displayDescription ?? name
  const accountImpact = resolveAccountImpactAmount({
    ...row,
    ...(payoutDisplay
      ? {
          ledger_amount: payoutDisplay.ledgerAmount,
          ledger_currency: payoutDisplay.ledgerCurrency,
        }
      : {}),
  })

  const listSenderName =
    !isVerification && bankLabel && !isEasnerProductReceiveTitle(bankLabel) ? bankLabel : undefined

  const sourceType = inferLedgerListSourceType(meta)

  return {
    id: idForUi,
    transaction_id: idForUi,
    ledger_row_id: ledgerId || undefined,
    type: transaction_type,
    transaction_type,
    amount: displayAmount,
    currency: displayCurrency,
    display_amount: displayAmount,
    display_currency: displayCurrency,
    display_description: displayName,
    ...(accountImpact
      ? {
          account_impact_amount: accountImpact.amount,
          account_impact_currency: accountImpact.currency,
        }
      : {}),
    ...(payoutDisplay
      ? {
          ledger_amount: payoutDisplay.ledgerAmount,
          ledger_currency: payoutDisplay.ledgerCurrency,
          display_hero_title: payoutDisplay.displayHeroTitle,
          ...(payoutDisplay.transactionProduct
            ? { transaction_product: payoutDisplay.transactionProduct }
            : {}),
        }
      : isYcFundBalance
        ? {
            display_hero_title:
              String(meta?.display_hero_title ?? "").trim() || ycDepositTitle,
            transaction_product: ycDepositTitle,
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
